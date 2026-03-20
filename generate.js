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

  let calCells = '';
  for (let i = firstDay-1; i >= 0; i--)
    calCells += '<div class="day-cell other-month"><div class="day-num">'+(daysInPrev-i)+'</div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isToday = dateStr === todayStr;
    const bks = bookedDays[d] || [];
    let cls = 'day-cell' + (isToday?' today':'') + (bks.length?' has-bookings':'');
    let inner = '<div class="day-num">'+d+'</div>';
    if (bks.length) {
      const seen = new Set();
      inner += '<div class="day-dots">';
      bks.forEach(bk => { if(!seen.has(bk.space)){seen.add(bk.space);inner+='<div class="dot" style="background:'+bk.color+'"></div>';} });
      inner += '</div>';
      inner += '<div class="booking-chip" style="background:'+bks[0].color+'22;color:'+bks[0].color+'">'+esc(bks[0].title)+'</div>';
      if (bks.length>1) inner += '<div style="font-size:0.5rem;color:var(--text-muted);margin-top:1px">+'+(bks.length-1)+' more</div>';
    }
    calCells += '<div class="'+cls+'">'+inner+'</div>';
  }
  const totalCells = Math.ceil((firstDay+daysInMonth)/7)*7;
  for (let i=firstDay+daysInMonth,nd=1; i<totalCells; i++,nd++)
    calCells += '<div class="day-cell other-month"><div class="day-num">'+nd+'</div></div>';

  const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
  const upcoming = allBookings.filter(bk => bk.end > startOfToday);

  let listHtml = '';
  let lastDate = '';
  for (const bk of upcoming) {
    const dateStr = fmtDate(bk.start);
    const isToday2 = fmtDate(now) === dateStr;
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      listHtml += '<div class="date-divider">'+(isToday2?'&#9658; Today &mdash; ':'')+esc(dateStr)+'</div>';
    }
    const isNow = bk.start <= now && bk.end > now;
    const cls = isNow ? 'booking-item is-now' : 'booking-item';
    listHtml += '<div class="'+cls+'" style="border-left-color:'+bk.color+'">'
      +'<div class="b-date"><strong>'+fmtTime(bk.start)+'</strong>'+fmtTime(bk.end)+'</div>'
      +'<div><div class="b-title">'+esc(bk.title)+'</div></div>'
      +'<div class="b-space"><span class="space-tag" style="background:'+bk.color+'22;color:'+bk.color+'">'+esc(bk.space)+'</span>'
      +(isNow ? '<span class="now-pill">Now</span>' : '')
      +'</div></div>';
  }
  if (!listHtml) listHtml = '<div class="empty-msg">No upcoming bookings</div>';

  const updatedStr = fmtTime(now);
  const countStr = upcoming.length + (upcoming.length===1?' event':' events');

  const lines = [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Gemco Venue Bookings</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Mono:wght@300;400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">',
    '<style>',
    ':root{--bg:#0d0d0f;--surface:#151518;--border:rgba(255,255,255,0.07);--gold:#c9a84c;--gold-dim:#7a6230;--text:#e8e4dc;--text-muted:#6b6760;--text-dim:#9e9891;}',
    '*{margin:0;padding:0;box-sizing:border-box;}',
    'html,body{width:100%;height:100vh;overflow:hidden;background:var(--bg);color:var(--text);font-family:\'DM Sans\',sans-serif;}',
    '.wrapper{display:grid;grid-template-rows:auto 1fr;height:100vh;padding:28px 36px 24px;gap:24px;}',
    'header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:18px;}',
    '.venue-name{font-family:\'Playfair Display\',serif;font-size:clamp(2rem,3.5vw,3rem);font-weight:700;color:var(--text);line-height:1;}',
    '.venue-sub{font-family:\'DM Mono\',monospace;font-size:0.72rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--gold);margin-top:6px;}',
    '.clock-block{text-align:right;}',
    '.time{font-family:\'DM Mono\',monospace;font-size:clamp(2rem,3.5vw,3rem);font-weight:300;letter-spacing:0.05em;color:var(--text);line-height:1;}',
    '.date{font-size:0.8rem;color:var(--text-muted);margin-top:5px;letter-spacing:0.08em;}',
    '.content{display:grid;grid-template-columns:1fr 1.15fr;gap:24px;min-height:0;}',
    '.calendar-panel{display:flex;flex-direction:column;gap:16px;}',
    '.month-label{font-family:\'Playfair Display\',serif;font-size:clamp(1.2rem,2vw,1.8rem);font-weight:400;color:var(--text);text-align:center;}',
    '.cal-grid{flex:1;display:grid;grid-template-rows:auto 1fr;}',
    '.day-headers{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:6px;}',
    '.day-hdr{font-family:\'DM Mono\',monospace;font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-muted);text-align:center;padding:4px 0;}',
    '.days-grid{display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:1fr;gap:4px;}',
    '.day-cell{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 7px;display:flex;flex-direction:column;gap:3px;min-height:0;overflow:hidden;}',
    '.day-cell.other-month{background:transparent;border-color:transparent;opacity:0.3;}',
    '.day-cell.today{border-color:var(--gold);background:rgba(201,168,76,0.07);}',
    '.day-cell.has-bookings{border-color:rgba(255,255,255,0.13);}',
    '.day-num{font-family:\'DM Mono\',monospace;font-size:0.75rem;color:var(--text-muted);line-height:1;}',
    '.day-cell.today .day-num{color:var(--gold);}',
    '.day-dots{display:flex;flex-wrap:wrap;gap:2px;margin-top:2px;}',
    '.dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}',
    '.booking-chip{font-size:0.55rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 4px;border-radius:3px;line-height:1.4;opacity:0.9;}',
    '.list-panel{display:flex;flex-direction:column;gap:14px;min-height:0;}',
    '.list-header{display:flex;align-items:center;justify-content:space-between;}',
    '.list-title{font-family:\'Playfair Display\',serif;font-size:clamp(1.2rem,2vw,1.8rem);font-weight:400;color:var(--text);}',
    '.badge{font-family:\'DM Mono\',monospace;font-size:0.65rem;color:var(--gold);background:rgba(201,168,76,0.1);border:1px solid var(--gold-dim);padding:3px 9px;border-radius:20px;}',
    '.last-updated{font-family:\'DM Mono\',monospace;font-size:0.6rem;color:var(--text-muted);}',
    '.booking-list{flex:1;overflow-y:hidden;display:flex;flex-direction:column;position:relative;}',
    '.booking-list::after{content:\'\';position:absolute;bottom:0;left:0;right:0;height:60px;background:linear-gradient(to bottom,transparent,var(--bg));pointer-events:none;}',
    '.booking-list-inner{display:flex;flex-direction:column;gap:8px;}',
    '.booking-item{display:grid;grid-template-columns:90px 1fr auto;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 14px;border-left:3px solid transparent;flex-shrink:0;}',
    '.booking-item.is-now{background:rgba(201,168,76,0.06);border-color:rgba(201,168,76,0.25);border-left-color:var(--gold);}',
    '.b-date{font-family:\'DM Mono\',monospace;font-size:0.7rem;color:var(--text-muted);line-height:1.5;}',
    '.b-date strong{display:block;font-size:0.8rem;color:var(--text-dim);font-weight:400;}',
    '.b-title{font-size:0.9rem;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.b-space{display:flex;flex-direction:column;align-items:flex-end;gap:4px;}',
    '.space-tag{font-family:\'DM Mono\',monospace;font-size:0.6rem;padding:3px 8px;border-radius:4px;white-space:nowrap;}',
    '.now-pill{font-family:\'DM Mono\',monospace;font-size:0.55rem;text-transform:uppercase;color:var(--gold);background:rgba(201,168,76,0.15);padding:2px 6px;border-radius:3px;}',
    '.empty-msg{font-family:\'DM Mono\',monospace;font-size:0.75rem;color:var(--text-muted);text-align:center;padding:40px 20px;}',
    '.date-divider{font-family:\'DM Mono\',monospace;font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--gold-dim);padding:6px 0 2px;flex-shrink:0;}',
    '</style></head><body>',
    '<div class="wrapper">',
    '<header><div class="logo-block"><div class="venue-name">Gemco</div><div class="venue-sub">Venue Bookings</div></div>',
    '<div class="clock-block"><div class="time" id="clock">--:--</div><div class="date" id="dateStr"></div></div></header>',
    '<div class="content">',
    '<div class="calendar-panel">',
    '<div class="month-label">'+monthLabel+'</div>',
    '<div class="cal-grid">',
    '<div class="day-headers"><div class="day-hdr">Sun</div><div class="day-hdr">Mon</div><div class="day-hdr">Tue</div><div class="day-hdr">Wed</div><div class="day-hdr">Thu</div><div class="day-hdr">Fri</div><div class="day-hdr">Sat</div></div>',
    '<div class="days-grid">'+calCells+'</div>',
    '</div></div>',
    '<div class="list-panel">',
    '<div class="list-header"><div class="list-title">Upcoming Bookings</div>',
    '<div style="display:flex;align-items:center;gap:12px;"><div class="last-updated">Updated '+updatedStr+'</div><div class="badge">'+countStr+'</div></div></div>',
    '<div class="booking-list"><div class="booking-list-inner" id="L">'+listHtml+'</div></div>',
    '</div></div></div>',
    '<script>',
    'function updateClock(){var n=new Date();document.getElementById("clock").textContent=n.toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit",hour12:true});document.getElementById("dateStr").textContent=n.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"});}',
    'setInterval(updateClock,1000);updateClock();',
    'var sp=0,le=document.querySelector(".booking-list"),ie=document.getElementById("L"),ni=ie.querySelector(".is-now");',
    'if(ni){sp=Math.max(0,ni.offsetTop-20);le.scrollTop=sp;}',
    'setInterval(function(){var mx=ie.scrollHeight-le.clientHeight;if(mx<=0)return;sp+=90;if(sp>=mx)sp=0;le.scrollTo({top:sp,behavior:"smooth"});},5000);',
    '<\/script></body></html>'
  ];

  fs.writeFileSync('index.html', lines.join('\n'));
  console.log('Written index.html with ' + upcoming.length + ' upcoming bookings');
}

main().catch(e => { console.error(e); process.exit(1); });
