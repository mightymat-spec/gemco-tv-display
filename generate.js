const https = require('https');
const fs = require('fs');

const SPACES = [
  { name: 'Theatre',     color: '#f0b429', url: 'https://thegem.skedda.com/ical?k=wllmzKDQxM9khM0tTiumcnfX9VblH_0Y&i=799644' },
  { name: 'Bar & Foyer', color: '#f05454', url: 'https://thegem.skedda.com/ical?k=ni2G54X1L4msVJezC0Q833xhIEgRSoFs&i=799645' },
  { name: 'Kitchen',     color: '#3dd68c', url: 'https://thegem.skedda.com/ical?k=9Lh0hWUw7lemD9ywTqzLKpki_GYvXaBg&i=799646' },
  { name: 'Hall',        color: '#5b9cf6', url: 'https://thegem.skedda.com/ical?k=8a6qMFX7qfqYT4oJp4bTU396Pq8hNvVP&i=799647' },
  { name: 'Carriage',    color: '#38d9f5', url: 'https://thegem.skedda.com/ical?k=Y7y2dMVSIC5W3_TB7_u3-AtO5nX0kPMK&i=799648' },
  { name: 'Car Park',    color: '#f5a623', url: 'https://thegem.skedda.com/ical?k=emlWXO3cntT_vy6oohiEi6SdG7dZYVlH&i=799649' }
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function unfold(text) { return text.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,''); }

function getProp(block, key) {
  const m = block.match(new RegExp(key + '(?:;[^:]+)?:(.+?)(?:\r?\n|\n|$)'));
  return m ? m[1].trim() : '';
}

function parseDt(raw) {
  if (!raw) return null;
  const isUtc = raw.endsWith('Z');
  const c = raw.replace('Z','');
  if (c.includes('T')) {
    const y=c.slice(0,4), mo=c.slice(4,6), d=c.slice(6,8);
    const h=c.slice(9,11), mi=c.slice(11,13), s=c.slice(13,15)||'00';
    return isUtc
      ? new Date(y+'-'+mo+'-'+d+'T'+h+':'+mi+':'+s+'Z')
      : new Date(y+'-'+mo+'-'+d+'T'+h+':'+mi+':'+s);
  } else {
    const y=c.slice(0,4), mo=c.slice(4,6), d=c.slice(6,8);
    return new Date(y+'-'+mo+'-'+d+'T00:00:00');
  }
}

function cleanTitle(raw) {
  let t = raw.includes(': ') ? raw.split(': ').slice(1).join(': ') : raw;
  t = t.replace(/\s*\([^)]*(?:theatre|hall|kitchen|foyer|carriage|car park|bar|rattler)[^)]*\)/gi,'');
  t = t.replace(/\s*\[(paid|unpaid)\]/gi,'');
  t = t.replace(/[-\u2013]?\s*(?:cost|hire|fee|price|aud|total)?:?\s*\$[\d,]+(?:\.\d{1,2})?/gi,'');
  return t.trim() || 'Booking';
}

function parseIcal(text, spaceName, color) {
  const blocks = unfold(text).split('BEGIN:VEVENT');
  blocks.shift();
  return blocks.map(block => {
    const start = parseDt(getProp(block,'DTSTART'));
    const end   = parseDt(getProp(block,'DTEND'));
    const raw   = getProp(block,'SUMMARY').replace(/\\,/g,',').replace(/\\n/g,' ').replace(/\\;/g,';');
    if (!start) return null;
    return { start, end, title: cleanTitle(raw), space: spaceName, color };
  }).filter(Boolean);
}

var DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDayKey(d) { return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(); }
function fmtDayLabel(d) { return DAYS[d.getDay()]+', '+d.getDate()+' '+MONTHS_SHORT[d.getMonth()]; }
function fmtTime(d) {
  var h=d.getHours(), m=d.getMinutes(), ampm=h>=12?'pm':'am';
  h=h%12; if(h===0)h=12;
  return h+':'+(m<10?'0'+m:m)+' '+ampm;
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function main() {
  const now = new Date();
  const allBookings = [];

  for (const space of SPACES) {
    try {
      const text = await fetchUrl(space.url);
      const events = parseIcal(text, space.name, space.color);
      allBookings.push(...events);
      console.log('Fetched ' + events.length + ' events for ' + space.name);
    } catch(e) {
      console.error('Failed ' + space.name + ':', e.message);
    }
  }

  allBookings.sort((a,b) => a.start - b.start);

  const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
  const upcoming = allBookings.filter(bk => bk.end > startOfToday);

  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate()+1);
  const todayKey    = fmtDayKey(now);
  const tomorrowKey = fmtDayKey(tomorrow);

  // Group by date
  var groups = [];
  var lastKey = '';
  var currentGroup = null;
  for (var i = 0; i < upcoming.length; i++) {
    var bk = upcoming[i];
    var key = fmtDayKey(bk.start);
    if (key !== lastKey) {
      lastKey = key;
      currentGroup = { key: key, label: fmtDayLabel(bk.start), bookings: [] };
      groups.push(currentGroup);
    }
    currentGroup.bookings.push(bk);
  }

  // Build list HTML
  var listHtml = '';
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g];
    var isToday    = grp.key === todayKey;
    var isTomorrow = grp.key === tomorrowKey;

    var labelPrefix = '';
    var hdrClass = 'date-hdr';
    if (isToday)    { labelPrefix = 'TODAY'; hdrClass = 'date-hdr today-hdr'; }
    else if (isTomorrow) { labelPrefix = 'TOMORROW'; hdrClass = 'date-hdr tomorrow-hdr'; }

    listHtml += '<div class="'+hdrClass+'">'
      + (labelPrefix ? '<span class="day-pill">'+labelPrefix+'</span> ' : '')
      + esc(grp.label)
      + '</div>';

    for (var b = 0; b < grp.bookings.length; b++) {
      var bk = grp.bookings[b];
      var isNow = bk.start <= now && bk.end > now;
      listHtml += '<div class="brow'+(isNow?' brow-now':'')+'" style="border-left:8px solid '+bk.color+';">'
        + '<div class="btime">'
        + '<span class="bstart">'+fmtTime(bk.start)+'</span>'
        + '<span class="bend">'+fmtTime(bk.end)+'</span>'
        + '</div>'
        + '<div class="bmid">'
        + '<span class="btitle">'+esc(bk.title)+'</span>'
        + (isNow ? '<span class="nowbadge">NOW</span>' : '')
        + '</div>'
        + '<div class="bspace" style="color:'+bk.color+'">'+esc(bk.space)+'</div>'
        + '</div>';
    }
  }

  if (!listHtml) listHtml = '<div class="empty">No upcoming bookings</div>';

  var monthLabel  = MONTHS[now.getMonth()] + ' ' + now.getFullYear();
  var updatedStr  = fmtTime(now);
  var countStr    = upcoming.length + ' events';

  var html = '<!DOCTYPE html>\n'
    + '<html><head>\n'
    + '<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">\n'
    + '<title>Gemco Venue Bookings</title>\n'
    + '<style>\n'
    + 'html,body{margin:0;padding:0;background:#09090b;color:#f0ece4;font-family:Arial,Helvetica,sans-serif;height:100%;overflow:hidden;}\n'

    /* ── HEADER ── */
    + '#hdr{background:#111116;border-bottom:3px solid #f0b429;padding:16px 28px;overflow:hidden;}\n'
    + '#hdr-left{float:left;}\n'
    + '#hdr-right{float:right;text-align:right;}\n'
    + '#vname{font-size:48px;font-weight:bold;color:#ffffff;line-height:1;margin:0;}\n'
    + '#vsub{font-size:12px;letter-spacing:6px;text-transform:uppercase;color:#f0b429;margin-top:6px;}\n'
    + '#month-pill{display:inline-block;background:#1e1a00;border:1px solid #f0b429;color:#f0b429;font-size:13px;letter-spacing:3px;text-transform:uppercase;padding:3px 12px;border-radius:20px;margin-top:8px;}\n'
    + '#clock{font-size:56px;font-weight:300;color:#ffffff;line-height:1;}\n'
    + '#dateline{font-size:14px;color:#888;margin-top:5px;}\n'
    + '#upd{font-size:11px;color:#555;margin-top:3px;}\n'

    /* ── META BAR ── */
    + '#meta{background:#111116;border-bottom:1px solid #222;padding:8px 28px;overflow:hidden;}\n'
    + '#meta-title{float:left;font-size:26px;font-weight:bold;color:#ffffff;line-height:36px;}\n'
    + '#meta-right{float:right;}\n'
    + '.badge{font-size:14px;color:#f0b429;border:1px solid #7a6230;padding:5px 14px;border-radius:14px;display:inline-block;background:#1a1400;}\n'

    /* ── SCROLL AREA ── */
    + '#scroll-area{position:relative;overflow:hidden;}\n'
    + '#list{padding:8px 20px 60px;}\n'

    /* ── DATE HEADERS ── */
    + '.date-hdr{font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#555;padding:18px 8px 6px;border-bottom:1px solid #222;margin-bottom:6px;overflow:hidden;}\n'
    + '.today-hdr{color:#f0f0f0;border-bottom:2px solid #f0b429;}\n'
    + '.tomorrow-hdr{color:#cccccc;border-bottom:1px solid #555;}\n'
    + '.day-pill{display:inline-block;background:#f0b429;color:#000;font-size:12px;font-weight:bold;letter-spacing:2px;padding:2px 10px;border-radius:4px;margin-right:6px;vertical-align:middle;}\n'
    + '.tomorrow-hdr .day-pill{background:#555;color:#fff;}\n'

    /* ── BOOKING ROWS ── */
    + '.brow{background:#18181c;border-radius:8px;margin-bottom:8px;padding:14px 16px;overflow:hidden;}\n'
    + '.brow-now{background:#1c1800;}\n'
    + '.btime{float:left;width:150px;}\n'
    + '.bstart{font-size:26px;font-weight:bold;color:#ffffff;display:block;line-height:1.1;}\n'
    + '.bend{font-size:15px;color:#666;display:block;margin-top:3px;}\n'
    + '.bmid{margin-left:166px;margin-right:150px;padding-top:2px;}\n'
    + '.btitle{font-size:24px;font-weight:bold;color:#f0ece4;display:block;line-height:1.2;}\n'
    + '.bspace{float:right;font-size:17px;font-weight:bold;text-align:right;width:140px;padding-top:6px;}\n'
    + '.nowbadge{display:inline-block;font-size:12px;background:#f0b429;color:#000;font-weight:bold;padding:2px 10px;border-radius:4px;margin-left:10px;vertical-align:middle;letter-spacing:1px;}\n'
    + '.empty{font-size:22px;color:#444;text-align:center;padding:80px;}\n'
    + '</style>\n'
    + '</head><body>\n'

    + '<div id="hdr">\n'
    + '  <div id="hdr-left">\n'
    + '    <div id="vname">Gemco</div>\n'
    + '    <div id="vsub">Venue Bookings</div>\n'
    + '    <div id="month-pill">'+monthLabel+'</div>\n'
    + '  </div>\n'
    + '  <div id="hdr-right">\n'
    + '    <div id="clock">--:--</div>\n'
    + '    <div id="dateline"></div>\n'
    + '    <div id="upd">Updated '+updatedStr+'</div>\n'
    + '  </div>\n'
    + '  <div style="clear:both"></div>\n'
    + '</div>\n'

    + '<div id="meta">\n'
    + '  <div id="meta-title">Upcoming Bookings</div>\n'
    + '  <div id="meta-right"><span class="badge">'+countStr+'</span></div>\n'
    + '  <div style="clear:both"></div>\n'
    + '</div>\n'

    + '<div id="scroll-area">\n'
    + '  <div id="list">'+listHtml+'</div>\n'
    + '</div>\n'

    + '<script>\n'
    + 'function ht(){return window.innerHeight||document.documentElement.clientHeight||768;}\n'
    + 'function resize(){\n'
    + '  var hh=document.getElementById("hdr").offsetHeight;\n'
    + '  var mh=document.getElementById("meta").offsetHeight;\n'
    + '  var sa=document.getElementById("scroll-area");\n'
    + '  sa.style.height=(ht()-hh-mh)+"px";\n'
    + '}\n'
    + 'resize();\n'
    + 'window.onresize=resize;\n'

    + 'function updateClock(){\n'
    + '  var n=new Date(),h=n.getHours(),m=n.getMinutes(),ampm=h>=12?"pm":"am";\n'
    + '  h=h%12;if(h===0)h=12;\n'
    + '  document.getElementById("clock").innerHTML=h+":"+(m<10?"0"+m:m)+" "+ampm;\n'
    + '  var days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];\n'
    + '  var months=["January","February","March","April","May","June","July","August","September","October","November","December"];\n'
    + '  document.getElementById("dateline").innerHTML=days[n.getDay()]+" "+n.getDate()+" "+months[n.getMonth()]+" "+n.getFullYear();\n'
    + '}\n'
    + 'setInterval(updateClock,1000); updateClock();\n'

    /* Smooth scroll — moves 2px every 30ms, pauses 3s at top/bottom */
    + 'var sp=0,paused=0,dir=1;\n'
    + 'var sa=document.getElementById("scroll-area");\n'
    + 'var li=document.getElementById("list");\n'
    + 'setInterval(function(){\n'
    + '  if(paused>0){paused--;return;}\n'
    + '  var mx=li.offsetHeight-sa.offsetHeight+40;\n'
    + '  if(mx<=0)return;\n'
    + '  sp+=2;\n'
    + '  if(sp>=mx){sp=mx;paused=100;dir=-1;}\n'  /* pause 3s at bottom then reset to top */
    + '  if(sp<=0){sp=0;paused=100;dir=1;}\n'
    + '  li.style.marginTop="-"+sp+"px";\n'
    + '  if(dir===-1 && paused>0){sp=0;}\n'  /* jump back to top after pause */
    + '},30);\n'
    + '</script>\n'
    + '</body></html>\n';

  fs.writeFileSync('index.html', html);
  console.log('Written index.html with ' + upcoming.length + ' upcoming bookings');
}

main().catch(e => { console.error(e); process.exit(1); });
