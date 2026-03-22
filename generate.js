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

const DAYS_AHEAD = 14;

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
    const y=c.slice(0,4),mo=c.slice(4,6),d=c.slice(6,8),h=c.slice(9,11),mi=c.slice(11,13),s=c.slice(13,15)||'00';
    return isUtc ? new Date(y+'-'+mo+'-'+d+'T'+h+':'+mi+':'+s+'Z') : new Date(y+'-'+mo+'-'+d+'T'+h+':'+mi+':'+s);
  } else {
    const y=c.slice(0,4),mo=c.slice(4,6),d=c.slice(6,8);
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

var DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDayKey(d) { return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(); }
function fmtTime(d) {
  var h=d.getHours(),m=d.getMinutes(),ampm=h>=12?'pm':'am';
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
  const endOfToday   = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate()+1);
  const cutoff       = new Date(startOfToday); cutoff.setDate(cutoff.getDate()+DAYS_AHEAD);

  // Today's bookings (all of them, even finished ones)
  const todayAll = allBookings.filter(bk => bk.start >= startOfToday && bk.start < endOfToday);
  // Future bookings (tomorrow onward, up to cutoff, not yet ended)
  const future   = allBookings.filter(bk => bk.start >= endOfToday && bk.start < cutoff);

  const todayKey    = fmtDayKey(now);
  const tomorrow    = new Date(startOfToday); tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowKey = fmtDayKey(tomorrow);

  // Group future by date
  var futureGroups = [];
  var lastKey = '';
  var currentGroup = null;
  for (var i = 0; i < future.length; i++) {
    var bk = future[i];
    var key = fmtDayKey(bk.start);
    if (key !== lastKey) {
      lastKey = key;
      currentGroup = { key: key, date: bk.start, bookings: [] };
      futureGroups.push(currentGroup);
    }
    currentGroup.bookings.push(bk);
  }

  function buildRow(bk, isNow) {
    return '<div class="brow'+(isNow?' brow-now':'')+'" style="border-left:8px solid '+bk.color+';">'
      + '<div class="btime"><span class="bstart">'+fmtTime(bk.start)+'</span><span class="bend">until '+fmtTime(bk.end)+'</span></div>'
      + '<div class="bmid"><span class="btitle">'+esc(bk.title)+'</span>'+(isNow?'<span class="nowbadge">NOW</span>':'')+'</div>'
      + '<div class="bspace" style="color:'+bk.color+'">'+esc(bk.space)+'</div>'
      + '</div>';
  }

  var listHtml = '';

  // ── TODAY section — always shown ──
  listHtml += '<div class="date-hdr today-hdr">'
    + '<span class="day-pill today-pill">TODAY</span>'
    + '<span class="hdr-day">'+DAYS_LONG[now.getDay()]+'</span>'
    + '<span class="hdr-date">'+now.getDate()+' '+MONTHS_SHORT[now.getMonth()]+'</span>'
    + '</div>';

  if (todayAll.length === 0) {
    listHtml += '<div class="no-today">No bookings today</div>';
  } else {
    for (var i = 0; i < todayAll.length; i++) {
      var bk = todayAll[i];
      var isNow = bk.start <= now && bk.end > now;
      listHtml += buildRow(bk, isNow);
    }
  }

  // ── FUTURE sections ──
  for (var g = 0; g < futureGroups.length; g++) {
    var grp = futureGroups[g];
    var d = grp.date;
    var isTomorrow = grp.key === tomorrowKey;
    var hdrClass = 'date-hdr' + (isTomorrow ? ' tmrw-hdr' : ' future-hdr');
    var pill = isTomorrow ? '<span class="day-pill tmrw-pill">TOMORROW</span>' : '';

    listHtml += '<div class="'+hdrClass+'">'
      + pill
      + '<span class="hdr-day">'+DAYS_LONG[d.getDay()]+'</span>'
      + '<span class="hdr-date">'+d.getDate()+' '+MONTHS_SHORT[d.getMonth()]+'</span>'
      + '</div>';

    for (var b = 0; b < grp.bookings.length; b++) {
      listHtml += buildRow(grp.bookings[b], false);
    }
  }

  var monthLabel = MONTHS_LONG[now.getMonth()] + ' ' + now.getFullYear();
  var updatedStr = fmtTime(now);
  var totalShown = todayAll.length + future.length;
  var countStr   = totalShown + (totalShown===1?' event':' events');

  var html = '<!DOCTYPE html>\n'
    + '<html><head>\n'
    + '<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">\n'
    + '<title>Gemco Venue Bookings</title>\n'
    + '<style>\n'
    + 'html,body{margin:0;padding:0;background:#09090b;color:#f0ece4;font-family:Arial,Helvetica,sans-serif;height:100%;overflow:hidden;}\n'
    + '#hdr{background:#111116;border-bottom:3px solid #f0b429;padding:14px 24px;overflow:hidden;}\n'
    + '#hdr-left{float:left;}\n'
    + '#hdr-right{float:right;text-align:right;}\n'
    + '#vname{font-size:44px;font-weight:bold;color:#ffffff;line-height:1;margin:0;}\n'
    + '#vsub{font-size:11px;letter-spacing:6px;text-transform:uppercase;color:#f0b429;margin-top:4px;}\n'
    + '#month-lbl{display:inline-block;background:#1e1a00;border:1px solid #f0b429;color:#f0b429;font-size:13px;letter-spacing:3px;text-transform:uppercase;padding:3px 12px;border-radius:20px;margin-top:7px;}\n'
    + '#clock{font-size:52px;font-weight:300;color:#ffffff;line-height:1;}\n'
    + '#dateline{font-size:14px;color:#aaa;margin-top:4px;}\n'
    + '#upd{font-size:11px;color:#555;margin-top:2px;}\n'
    + '#meta{background:#111116;border-bottom:1px solid #2a2a30;padding:8px 24px;overflow:hidden;}\n'
    + '#meta-title{float:left;font-size:24px;font-weight:bold;color:#fff;line-height:34px;}\n'
    + '#meta-right{float:right;}\n'
    + '.badge{font-size:13px;color:#f0b429;border:1px solid #7a6230;padding:4px 14px;border-radius:14px;display:inline-block;background:#1a1400;}\n'
    + '#scroll-area{position:relative;overflow:hidden;}\n'
    + '#list{padding:6px 20px 60px;}\n'

    /* Date headers */
    + '.date-hdr{padding:16px 8px 8px;margin-bottom:4px;overflow:hidden;border-bottom:2px solid #333;}\n'
    + '.today-hdr{border-bottom:3px solid #f0b429;margin-bottom:8px;}\n'
    + '.tmrw-hdr{border-bottom:2px solid #888;}\n'
    + '.future-hdr{border-bottom:1px solid #2a2a2a;}\n'
    + '.day-pill{display:inline-block;font-size:13px;font-weight:bold;letter-spacing:2px;padding:3px 12px;border-radius:4px;margin-right:10px;vertical-align:middle;}\n'
    + '.today-pill{background:#f0b429;color:#000;}\n'
    + '.tmrw-pill{background:#555;color:#fff;}\n'
    + '.hdr-day{font-size:26px;font-weight:bold;color:#ffffff;vertical-align:middle;margin-right:10px;}\n'
    + '.today-hdr .hdr-day{color:#ffffff;}\n'
    + '.tmrw-hdr .hdr-day{color:#dddddd;}\n'
    + '.future-hdr .hdr-day{color:#aaaaaa;}\n'
    + '.hdr-date{font-size:22px;color:#f0b429;vertical-align:middle;font-weight:bold;}\n'
    + '.tmrw-hdr .hdr-date{color:#aaa;}\n'
    + '.future-hdr .hdr-date{color:#777;}\n'

    /* Booking rows */
    + '.brow{background:#18181c;border-radius:8px;margin-bottom:7px;padding:14px 16px;overflow:hidden;}\n'
    + '.brow-now{background:#1c1800;}\n'
    + '.btime{float:left;width:150px;}\n'
    + '.bstart{font-size:26px;font-weight:bold;color:#ffffff;display:block;line-height:1.1;}\n'
    + '.bend{font-size:14px;color:#666;display:block;margin-top:3px;}\n'
    + '.bmid{margin-left:166px;margin-right:155px;padding-top:3px;}\n'
    + '.btitle{font-size:24px;font-weight:bold;color:#f0ece4;display:block;line-height:1.2;}\n'
    + '.bspace{float:right;font-size:18px;font-weight:bold;text-align:right;width:145px;padding-top:6px;}\n'
    + '.nowbadge{display:inline-block;font-size:12px;background:#f0b429;color:#000;font-weight:bold;padding:2px 10px;border-radius:4px;margin-left:10px;vertical-align:middle;letter-spacing:1px;}\n'
    + '.no-today{font-size:18px;color:#555;padding:16px 8px;font-style:italic;}\n'
    + '.empty{font-size:22px;color:#444;text-align:center;padding:80px;}\n'
    + '</style>\n'
    + '</head><body>\n'
    + '<div id="hdr">\n'
    + '  <div id="hdr-left"><div id="vname">Gemco</div><div id="vsub">Venue Bookings</div><div id="month-lbl">'+monthLabel+'</div></div>\n'
    + '  <div id="hdr-right"><div id="clock">--:--</div><div id="dateline"></div><div id="upd">Updated '+updatedStr+'</div></div>\n'
    + '  <div style="clear:both"></div>\n'
    + '</div>\n'
    + '<div id="meta">\n'
    + '  <div id="meta-title">Bookings — Next 2 Weeks</div>\n'
    + '  <div id="meta-right"><span class="badge">'+countStr+'</span></div>\n'
    + '  <div style="clear:both"></div>\n'
    + '</div>\n'
    + '<div id="scroll-area"><div id="list">'+listHtml+'</div></div>\n'
    + '<script>\n'
    + 'function ht(){return window.innerHeight||document.documentElement.clientHeight||768;}\n'
    + 'function resize(){var hh=document.getElementById("hdr").offsetHeight,mh=document.getElementById("meta").offsetHeight,sa=document.getElementById("scroll-area");sa.style.height=(ht()-hh-mh)+"px";}\n'
    + 'resize(); window.onresize=resize;\n'
    + 'function updateClock(){var n=new Date(),h=n.getHours(),m=n.getMinutes(),ampm=h>=12?"pm":"am";h=h%12;if(h===0)h=12;document.getElementById("clock").innerHTML=h+":"+(m<10?"0"+m:m)+" "+ampm;var days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];var months=["January","February","March","April","May","June","July","August","September","October","November","December"];document.getElementById("dateline").innerHTML=days[n.getDay()]+" "+n.getDate()+" "+months[n.getMonth()]+" "+n.getFullYear();}\n'
    + 'setInterval(updateClock,1000); updateClock();\n'
    /* Smooth scroll: glides down slowly, pauses at bottom, jumps back to top, pauses, repeats */
    + 'var sp=0,paused=0,sa=document.getElementById("scroll-area"),li=document.getElementById("list");\n'
    + 'setInterval(function(){\n'
    + '  if(paused>0){paused--;if(paused===0)sp=0;return;}\n'
    + '  var mx=li.offsetHeight-sa.offsetHeight+40;\n'
    + '  if(mx<=0)return;\n'
    + '  sp+=1.5;\n'
    + '  if(sp>=mx){sp=mx;paused=150;}\n'
    + '  li.style.marginTop="-"+sp+"px";\n'
    + '},30);\n'
    + '</script>\n'
    + '</body></html>\n';

  fs.writeFileSync('index.html', html);
  console.log('Written index.html — today: '+todayAll.length+' events, next 2 weeks: '+future.length+' events');
}

main().catch(e => { console.error(e); process.exit(1); });
