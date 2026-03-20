const https = require('https');
const fs = require('fs');

const SPACES = [
  { name: 'Theatre',     color: '#c9a84c', url: 'https://thegem.skedda.com/ical?k=wllmzKDQxM9khM0tTiumcnfX9VblH_0Y&i=799644' },
  { name: 'Bar & Foyer', color: '#c94c4c', url: 'https://thegem.skedda.com/ical?k=ni2G54X1L4msVJezC0Q833xhIEgRSoFs&i=799645' },
  { name: 'Kitchen',     color: '#4caa6e', url: 'https://thegem.skedda.com/ical?k=9Lh0hWUw7lemD9ywTqzLKpki_GYvXaBg&i=799646' },
  { name: 'Hall',        color: '#4c7ec9', url: 'https://thegem.skedda.com/ical?k=8a6qMFX7qfqYT4oJp4bTU396Pq8hNvVP&i=799647' },
  { name: 'Carriage',    color: '#4cb8c9', url: 'https://thegem.skedda.com/ical?k=Y7y2dMVSIC5W3_TB7_u3-AtO5nX0kPMK&i=799648' },
  { name: 'Car Park',    color: '#c97a4c', url: 'https://thegem.skedda.com/ical?k=emlWXO3cntT_vy6oohiEi6SdG7dZYVlH&i=799649' }
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

function fmtDate(d) { return d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}); }
function fmtTime(d) { return d.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',hour12:true}); }
function isoDate(d) { return d.toISOString().slice(0,10); }
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

  // ── Calendar ──
  const calYear  = now.getFullYear();
  const calMonth = now.getMonth();
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();
  const todayStr    = isoDate(now);
  const monthLabel  = now.toLocaleDateString('en-AU',{month:'long',year:'numeric'});

  const bookedDays = {};
  for (const bk of allBookings) {
    if (bk.start.getFullYear()===calYear && bk.start.getMonth()===calMonth) {
      const k = bk.start.getDate();
      if (!bookedDays[k]) bookedDays[k] = [];
      bookedDays[k].push(bk);
    }
  }

  // Calendar cells — table-based for Android 4.4 compatibility
  let calRows = '';
  let cellCount = 0;
  let row = '<tr>';
  // Padding before first day
  for (let i = 0; i < firstDay; i++) {
    row += '<td class="dc om"><span class="dn">'+(daysInPrev - firstDay + i + 1)+'</span></td>';
    cellCount++;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isToday = dateStr === todayStr;
    const bks = bookedDays[d] || [];
    let tdClass = 'dc' + (isToday?' td':'') + (bks.length?' hb':'');
    let inner = '<span class="dn'+(isToday?' tdn':'')+'">'+d+'</span>';
    if (bks.length) {
      const seen = new Set();
      inner += '<div class="dots">';
      bks.forEach(bk => { if(!seen.has(bk.space)){seen.add(bk.space);inner+='<span class="dot" style="background:'+bk.color+'"></span>';} });
      inner += '</div>';
      inner += '<div class="chip" style="background:'+bks[0].color+'33;color:'+bks[0].color+'">'+esc(bks[0].title)+'</div>';
      if (bks.length>1) inner += '<div class="more">+'+(bks.length-1)+'</div>';
    }
    row += '<td class="'+tdClass+'">'+inner+'</td>';
    cellCount++;
    if (cellCount % 7 === 0) { calRows += row+'</tr>'; row = '<tr>'; }
  }
  // Pad end
  let nd = 1;
  while (cellCount % 7 !== 0) {
    row += '<td class="dc om"><span class="dn">'+nd+'</span></td>';
    cellCount++; nd++;
  }
  if (row !== '<tr>') calRows += row+'</tr>';

  // ── Booking list ──
  const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
  const upcoming = allBookings.filter(bk => bk.end > startOfToday);

  let listHtml = '';
  let lastDate = '';
  for (const bk of upcoming) {
    const dateStr = fmtDate(bk.start);
    const isToday2 = fmtDate(now) === dateStr;
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      listHtml += '<div class="divider">'+(isToday2?'&#9658; Today &mdash; ':'')+esc(dateStr)+'</div>';
    }
    const isNow = bk.start <= now && bk.end > now;
    const rowBg = isNow ? '#1a1800' : '#151518';
    const leftBorder = isNow ? '3px solid #c9a84c' : '3px solid '+bk.color;
    listHtml += '<table class="bi" style="background:'+rowBg+';border-left:'+leftBorder+'" cellpadding="0" cellspacing="0">'
      +'<tr>'
      +'<td class="bt"><strong>'+fmtTime(bk.start)+'</strong><br>'+fmtTime(bk.end)+'</td>'
      +'<td class="btitle">'+esc(bk.title)+(isNow?'<span class="now">Now</span>':'')+'</td>'
      +'<td class="bspace"><span class="stag" style="background:'+bk.color+'33;color:'+bk.color+'">'+esc(bk.space)+'</span></td>'
      +'</tr></table>';
  }
  if (!listHtml) listHtml = '<div class="empty">No upcoming bookings</div>';

  const updatedStr = fmtTime(now);
  const countStr = upcoming.length + (upcoming.length===1?' event':' events');

  const html = '<!DOCTYPE html>\n'
    +'<html><head>\n'
    +'<meta charset="UTF-8">\n'
    +'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    +'<title>Gemco Venue Bookings</title>\n'
    +'<style>\n'
    +'body{margin:0;padding:0;background:#0d0d0f;color:#e8e4dc;font-family:Arial,sans-serif;overflow:hidden;}\n'
    +'#wrap{width:100%;height:100vh;overflow:hidden;}\n'
    +'#hdr{padding:16px 24px 12px;border-bottom:1px solid #222;overflow:hidden;}\n'
    +'#hdr-left{float:left;}\n'
    +'#hdr-right{float:right;text-align:right;}\n'
    +'#vname{font-size:36px;font-weight:bold;color:#e8e4dc;line-height:1;}\n'
    +'#vsub{font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;margin-top:4px;}\n'
    +'#clock{font-size:36px;font-weight:300;color:#e8e4dc;line-height:1;letter-spacing:2px;}\n'
    +'#dateline{font-size:12px;color:#6b6760;margin-top:4px;}\n'
    +'#body{overflow:hidden;padding:16px 24px;}\n'
    +'#cal-col{float:left;width:44%;}\n'
    +'#list-col{float:right;width:53%;height:88vh;overflow:hidden;position:relative;}\n'
    +'#list-fade{position:absolute;bottom:0;left:0;right:0;height:60px;background:-webkit-linear-gradient(top,transparent,#0d0d0f);pointer-events:none;}\n'
    +'#month-lbl{font-size:22px;color:#e8e4dc;text-align:center;margin-bottom:10px;}\n'
    +'.cal-tbl{width:100%;border-collapse:collapse;}\n'
    +'.cal-tbl th{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b6760;text-align:center;padding:3px 0;}\n'
    +'.dc{background:#151518;border:1px solid #1e1e22;border-radius:6px;padding:4px 5px;vertical-align:top;height:60px;width:14%;overflow:hidden;}\n'
    +'.om{background:transparent;border-color:transparent;opacity:0.3;}\n'
    +'.td{border-color:#c9a84c;background:#161400;}\n'
    +'.hb{border-color:#2a2a30;}\n'
    +'.dn{font-size:11px;color:#6b6760;display:block;line-height:1;}\n'
    +'.tdn{color:#c9a84c;}\n'
    +'.dots{margin-top:2px;}\n'
    +'.dot{display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:1px;}\n'
    +'.chip{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 3px;border-radius:2px;margin-top:2px;}\n'
    +'.more{font-size:8px;color:#6b6760;margin-top:1px;}\n'
    +'#list-hdr{overflow:hidden;margin-bottom:10px;}\n'
    +'#list-title{font-size:22px;color:#e8e4dc;float:left;}\n'
    +'#list-meta{float:right;text-align:right;}\n'
    +'.badge{font-size:10px;color:#c9a84c;border:1px solid #7a6230;padding:2px 8px;border-radius:10px;background:#110e00;}\n'
    +'.upd{font-size:9px;color:#6b6760;display:block;margin-bottom:3px;}\n'
    +'#list-inner{overflow:hidden;}\n'
    +'.divider{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#7a6230;padding:6px 0 3px;}\n'
    +'.bi{width:100%;border-collapse:collapse;border-radius:8px;margin-bottom:6px;}\n'
    +'.bi td{padding:7px 10px;vertical-align:middle;}\n'
    +'.bt{font-size:10px;color:#6b6760;width:80px;white-space:nowrap;line-height:1.6;}\n'
    +'.bt strong{display:block;font-size:12px;color:#9e9891;}\n'
    +'.btitle{font-size:13px;font-weight:bold;color:#e8e4dc;}\n'
    +'.bspace{text-align:right;white-space:nowrap;}\n'
    +'.stag{font-size:9px;padding:2px 7px;border-radius:3px;}\n'
    +'.now{font-size:8px;color:#c9a84c;background:#1a1400;padding:1px 5px;border-radius:2px;margin-left:6px;text-transform:uppercase;}\n'
    +'.empty{font-size:12px;color:#6b6760;text-align:center;padding:30px;}\n'
    +'</style>\n'
    +'</head><body>\n'
    +'<div id="wrap">\n'
    +'<div id="hdr"><div id="hdr-left"><div id="vname">Gemco</div><div id="vsub">Venue Bookings</div></div>'
    +'<div id="hdr-right"><div id="clock" id="clock">--:--</div><div id="dateline" id="dateline"></div></div>'
    +'<div style="clear:both"></div></div>\n'
    +'<div id="body">\n'
    +'<div id="cal-col">\n'
    +'<div id="month-lbl">'+monthLabel+'</div>\n'
    +'<table class="cal-tbl"><thead><tr>'
    +'<th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th>'
    +'</tr></thead><tbody>'+calRows+'</tbody></table>\n'
    +'</div>\n'
    +'<div id="list-col">\n'
    +'<div id="list-hdr">'
    +'<div id="list-title">Upcoming Bookings</div>'
    +'<div id="list-meta"><span class="upd">Updated '+updatedStr+'</span><span class="badge">'+countStr+'</span></div>'
    +'<div style="clear:both"></div></div>\n'
    +'<div id="list-inner">'+listHtml+'</div>\n'
    +'<div id="list-fade"></div>\n'
    +'</div>\n'
    +'<div style="clear:both"></div>\n'
    +'</div>\n'
    +'</div>\n'
    +'<script>\n'
    +'function updateClock(){\n'
    +'  var n=new Date();\n'
    +'  var h=n.getHours(),m=n.getMinutes(),ampm=h>=12?"pm":"am";\n'
    +'  h=h%12;if(h===0)h=12;\n'
    +'  document.getElementById("clock").innerHTML=h+":"+(m<10?"0"+m:m)+" "+ampm;\n'
    +'  var days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];\n'
    +'  var months=["January","February","March","April","May","June","July","August","September","October","November","December"];\n'
    +'  document.getElementById("dateline").innerHTML=days[n.getDay()]+" "+n.getDate()+" "+months[n.getMonth()]+" "+n.getFullYear();\n'
    +'}\n'
    +'setInterval(updateClock,1000);\n'
    +'updateClock();\n'
    +'var sp=0;\n'
    +'var li=document.getElementById("list-inner");\n'
    +'var lc=document.getElementById("list-col");\n'
    +'setInterval(function(){\n'
    +'  var mx=li.scrollHeight-lc.clientHeight+80;\n'
    +'  if(mx<=0)return;\n'
    +'  sp+=80;\n'
    +'  if(sp>=mx)sp=0;\n'
    +'  li.style.marginTop="-"+sp+"px";\n'
    +'},4000);\n'
    +'</script>\n'
    +'</body></html>';

  fs.writeFileSync('index.html', html);
  console.log('Written index.html with ' + upcoming.length + ' upcoming bookings');
}

main().catch(e => { console.error(e); process.exit(1); });
