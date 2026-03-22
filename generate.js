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

function unfold(t) { return t.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,''); }
function getProp(block, key) {
  const m = block.match(new RegExp(key+'(?:;[^:]+)?:(.+?)(?:\r?\n|\n|$)'));
  return m ? m[1].trim() : '';
}
function parseDt(raw) {
  if (!raw) return null;
  const isUtc = raw.endsWith('Z'), c = raw.replace('Z','');
  if (c.includes('T')) {
    const y=c.slice(0,4),mo=c.slice(4,6),d=c.slice(6,8),h=c.slice(9,11),mi=c.slice(11,13),s=c.slice(13,15)||'00';
    return isUtc ? new Date(y+'-'+mo+'-'+d+'T'+h+':'+mi+':'+s+'Z') : new Date(y+'-'+mo+'-'+d+'T'+h+':'+mi+':'+s);
  }
  const y=c.slice(0,4),mo=c.slice(4,6),d=c.slice(6,8);
  return new Date(y+'-'+mo+'-'+d+'T00:00:00');
}
function cleanTitle(raw) {
  let t = raw.includes(': ') ? raw.split(': ').slice(1).join(': ') : raw;
  t = t.replace(/\s*\([^)]*(?:theatre|hall|kitchen|foyer|carriage|car park|bar|rattler)[^)]*\)/gi,'');
  t = t.replace(/\s*\[(paid|unpaid)\]/gi,'');
  t = t.replace(/[-\u2013]?\s*(?:cost|hire|fee|price|aud|total)?:?\s*\$[\d,]+(?:\.\d{1,2})?/gi,'');
  return t.trim() || 'Booking';
}
function parseIcal(text, spaceName, color) {
  const blocks = unfold(text).split('BEGIN:VEVENT'); blocks.shift();
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

function buildRow(bk, isNow) {
  return '<div class="brow'+(isNow?' brow-now':'')+'" style="border-left:8px solid '+bk.color+';">'
    +'<div class="btime"><span class="bstart">'+fmtTime(bk.start)+'</span><span class="bend">until '+fmtTime(bk.end)+'</span></div>'
    +'<div class="bmid"><span class="btitle">'+esc(bk.title)+'</span>'+(isNow?'<span class="nowbadge">NOW</span>':'')+'</div>'
    +'<div class="bspace" style="color:'+bk.color+'">'+esc(bk.space)+'</div>'
    +'</div>';
}

async function main() {
  const now = new Date();
  const allBookings = [];

  for (const space of SPACES) {
    try {
      const text = await fetchUrl(space.url);
      const events = parseIcal(text, space.name, space.color);
      allBookings.push(...events);
      console.log('Fetched '+events.length+' events for '+space.name);
    } catch(e) { console.error('Failed '+space.name+':',e.message); }
  }
  allBookings.sort((a,b) => a.start - b.start);

  const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
  const endOfToday   = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate()+1);
  const cutoff       = new Date(startOfToday); cutoff.setDate(cutoff.getDate()+DAYS_AHEAD);
  const tomorrow     = new Date(startOfToday); tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowKey  = fmtDayKey(tomorrow);

  // Today — all bookings regardless of whether finished
  const todayAll = allBookings.filter(bk => bk.start >= startOfToday && bk.start < endOfToday);
  // Future — tomorrow onwards up to cutoff
  const future   = allBookings.filter(bk => bk.start >= endOfToday && bk.start < cutoff);

  // ── TODAY HTML (pinned, never scrolls) ──
  var todayHtml = '<div class="today-hdr-bar">'
    +'<span class="today-pill">TODAY</span>'
    +'<span class="today-day">'+DAYS_LONG[now.getDay()]+'</span>'
    +'<span class="today-date">'+now.getDate()+' '+MONTHS_SHORT[now.getMonth()]+'</span>'
    +'</div>';

  if (todayAll.length === 0) {
    todayHtml += '<div class="no-today">No bookings today</div>';
  } else {
    for (var i = 0; i < todayAll.length; i++) {
      var bk = todayAll[i];
      todayHtml += buildRow(bk, bk.start <= now && bk.end > now);
    }
  }

  // ── FUTURE HTML (scrolling) ──
  var futureHtml = '';
  var groups = [], lastKey = '', cur = null;
  for (var i = 0; i < future.length; i++) {
    var bk = future[i], key = fmtDayKey(bk.start);
    if (key !== lastKey) { lastKey=key; cur={key:key,date:bk.start,bookings:[]}; groups.push(cur); }
    cur.bookings.push(bk);
  }
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g], d = grp.date;
    var isTmrw = grp.key === tomorrowKey;
    futureHtml += '<div class="date-hdr'+(isTmrw?' tmrw-hdr':' future-hdr')+'">'
      +(isTmrw?'<span class="day-pill tmrw-pill">TOMORROW</span>':'')
      +'<span class="hdr-day">'+DAYS_LONG[d.getDay()]+'</span>'
      +'<span class="hdr-date">'+d.getDate()+' '+MONTHS_SHORT[d.getMonth()]+'</span>'
      +'</div>';
    for (var b = 0; b < grp.bookings.length; b++) futureHtml += buildRow(grp.bookings[b], false);
  }
  if (!futureHtml) futureHtml = '<div class="no-future">No further bookings in the next '+DAYS_AHEAD+' days</div>';

  var monthLabel = MONTHS_LONG[now.getMonth()]+' '+now.getFullYear();
  var updatedStr = fmtTime(now);
  var totalCount = todayAll.length + future.length;

  var html = '<!DOCTYPE html>\n<html><head>\n'
    +'<meta charset="UTF-8">\n'
    +'<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">\n'
    +'<title>Gemco Venue Bookings</title>\n'
    +'<style>\n'
    +'html,body{margin:0;padding:0;background:#09090b;color:#f0ece4;font-family:Arial,Helvetica,sans-serif;height:100%;overflow:hidden;}\n'
    // Top header
    +'#hdr{background:#111116;border-bottom:3px solid #f0b429;padding:14px 24px;overflow:hidden;}\n'
    +'#hdr-left{float:left;}\n#hdr-right{float:right;text-align:right;}\n'
    +'#vname{font-size:44px;font-weight:bold;color:#fff;line-height:1;margin:0;}\n'
    +'#vsub{font-size:11px;letter-spacing:6px;text-transform:uppercase;color:#f0b429;margin-top:4px;}\n'
    +'#month-lbl{display:inline-block;background:#1e1a00;border:1px solid #f0b429;color:#f0b429;font-size:13px;letter-spacing:3px;text-transform:uppercase;padding:3px 12px;border-radius:20px;margin-top:7px;}\n'
    +'#clock{font-size:52px;font-weight:300;color:#fff;line-height:1;}\n'
    +'#dateline{font-size:14px;color:#aaa;margin-top:4px;}\n'
    +'#upd{font-size:11px;color:#555;margin-top:2px;}\n'
    // Today pinned section
    +'#today-panel{background:#111116;border-bottom:3px solid #f0b429;padding:0 20px 10px;}\n'
    +'.today-hdr-bar{padding:12px 8px 8px;overflow:hidden;border-bottom:2px solid #f0b429;margin-bottom:8px;}\n'
    +'.today-pill{display:inline-block;background:#f0b429;color:#000;font-size:13px;font-weight:bold;letter-spacing:2px;padding:3px 12px;border-radius:4px;margin-right:10px;vertical-align:middle;}\n'
    +'.today-day{font-size:26px;font-weight:bold;color:#fff;vertical-align:middle;margin-right:10px;}\n'
    +'.today-date{font-size:22px;font-weight:bold;color:#f0b429;vertical-align:middle;}\n'
    +'.no-today{font-size:18px;color:#555;padding:10px 8px;font-style:italic;}\n'
    // Future scrolling section
    +'#future-label{background:#0d0d10;border-bottom:1px solid #2a2a30;padding:8px 24px;overflow:hidden;}\n'
    +'#future-label-left{float:left;font-size:20px;font-weight:bold;color:#aaa;line-height:28px;}\n'
    +'#future-label-right{float:right;}\n'
    +'.badge{font-size:13px;color:#f0b429;border:1px solid #7a6230;padding:4px 14px;border-radius:14px;display:inline-block;background:#1a1400;}\n'
    +'#scroll-area{overflow:hidden;position:relative;}\n'
    +'#future-list{padding:6px 20px 60px;}\n'
    // Date headers in future
    +'.date-hdr{padding:14px 8px 7px;margin-bottom:4px;overflow:hidden;}\n'
    +'.tmrw-hdr{border-bottom:2px solid #888;}\n'
    +'.future-hdr{border-bottom:1px solid #2a2a2a;}\n'
    +'.day-pill{display:inline-block;font-size:13px;font-weight:bold;letter-spacing:2px;padding:3px 12px;border-radius:4px;margin-right:10px;vertical-align:middle;}\n'
    +'.tmrw-pill{background:#555;color:#fff;}\n'
    +'.hdr-day{font-size:24px;font-weight:bold;vertical-align:middle;margin-right:8px;}\n'
    +'.tmrw-hdr .hdr-day{color:#ddd;}\n'
    +'.future-hdr .hdr-day{color:#999;}\n'
    +'.hdr-date{font-size:20px;font-weight:bold;vertical-align:middle;}\n'
    +'.tmrw-hdr .hdr-date{color:#aaa;}\n'
    +'.future-hdr .hdr-date{color:#666;}\n'
    // Booking rows
    +'.brow{background:#18181c;border-radius:8px;margin-bottom:7px;padding:12px 14px;overflow:hidden;}\n'
    +'.brow-now{background:#1c1800;}\n'
    +'.btime{float:left;width:150px;}\n'
    +'.bstart{font-size:26px;font-weight:bold;color:#fff;display:block;line-height:1.1;}\n'
    +'.bend{font-size:14px;color:#666;display:block;margin-top:3px;}\n'
    +'.bmid{margin-left:166px;margin-right:155px;padding-top:3px;}\n'
    +'.btitle{font-size:23px;font-weight:bold;color:#f0ece4;display:block;line-height:1.2;}\n'
    +'.bspace{float:right;font-size:17px;font-weight:bold;text-align:right;width:145px;padding-top:5px;}\n'
    +'.nowbadge{display:inline-block;font-size:12px;background:#f0b429;color:#000;font-weight:bold;padding:2px 10px;border-radius:4px;margin-left:10px;vertical-align:middle;}\n'
    +'.no-future{font-size:18px;color:#444;padding:30px 8px;font-style:italic;}\n'
    +'</style>\n</head><body>\n'

    // Top header
    +'<div id="hdr">\n'
    +'  <div id="hdr-left"><div id="vname">Gemco</div><div id="vsub">Venue Bookings</div><div id="month-lbl">'+monthLabel+'</div></div>\n'
    +'  <div id="hdr-right"><div id="clock">--:--</div><div id="dateline"></div><div id="upd">Updated '+updatedStr+'</div></div>\n'
    +'  <div style="clear:both"></div>\n</div>\n'

    // TODAY — pinned
    +'<div id="today-panel">'+todayHtml+'</div>\n'

    // Future label bar
    +'<div id="future-label">\n'
    +'  <div id="future-label-left">Coming Up — Next 2 Weeks</div>\n'
    +'  <div id="future-label-right"><span class="badge">'+future.length+' events</span></div>\n'
    +'  <div style="clear:both"></div>\n</div>\n'

    // Future scrolling area
    +'<div id="scroll-area"><div id="future-list">'+futureHtml+'</div></div>\n'

    +'<script>\n'
    // Resize scroll area to fill remaining height
    +'function resize(){\n'
    +'  var h=window.innerHeight||768;\n'
    +'  var used=document.getElementById("hdr").offsetHeight\n'
    +'    +document.getElementById("today-panel").offsetHeight\n'
    +'    +document.getElementById("future-label").offsetHeight;\n'
    +'  document.getElementById("scroll-area").style.height=(h-used)+"px";\n'
    +'}\n'
    +'resize(); window.onresize=resize;\n'

    // Clock
    +'function updateClock(){\n'
    +'  var n=new Date(),h=n.getHours(),m=n.getMinutes(),ampm=h>=12?"pm":"am";\n'
    +'  h=h%12;if(h===0)h=12;\n'
    +'  document.getElementById("clock").innerHTML=h+":"+(m<10?"0"+m:m)+" "+ampm;\n'
    +'  var days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];\n'
    +'  var months=["January","February","March","April","May","June","July","August","September","October","November","December"];\n'
    +'  document.getElementById("dateline").innerHTML=days[n.getDay()]+" "+n.getDate()+" "+months[n.getMonth()]+" "+n.getFullYear();\n'
    +'}\n'
    +'setInterval(updateClock,1000); updateClock();\n'

    // Smooth scroll future list only
    +'var sp=0,paused=0;\n'
    +'var sa=document.getElementById("scroll-area");\n'
    +'var fl=document.getElementById("future-list");\n'
    +'setInterval(function(){\n'
    +'  if(paused>0){paused--;if(paused===0)sp=0;return;}\n'
    +'  var mx=fl.offsetHeight-sa.offsetHeight+40;\n'
    +'  if(mx<=0)return;\n'
    +'  sp+=1.5;\n'
    +'  if(sp>=mx){paused=150;}\n'
    +'  else{fl.style.marginTop="-"+sp+"px";}\n'
    +'},30);\n'
    +'</script>\n</body></html>\n';

  fs.writeFileSync('index.html', html);
  console.log('Written — today: '+todayAll.length+', future 2wks: '+future.length);
}

main().catch(e => { console.error(e); process.exit(1); });
