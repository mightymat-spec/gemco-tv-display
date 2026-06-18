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
const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MSHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
  return new Date(c.slice(0,4)+'-'+c.slice(4,6)+'-'+c.slice(6,8)+'T00:00:00');
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
function fmtDayKey(d) { return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(); }
function fmtTime(d) {
  var h=d.getHours(),m=d.getMinutes(),ampm=h>=12?'pm':'am';
  h=h%12; if(h===0)h=12;
  return h+':'+(m<10?'0'+m:m)+' '+ampm;
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function row(bk, isNow) {
  return '<div class="brow'+(isNow?' now':'')+'" style="border-left:8px solid '+bk.color+';">'
    +'<div class="bt"><span class="bs">'+fmtTime(bk.start)+'</span><span class="be">until '+fmtTime(bk.end)+'</span></div>'
    +'<div class="bm"><span class="bi">'+esc(bk.title)+'</span>'+(isNow?'<span class="nb">NOW</span>':'')+'</div>'
    +'<div class="bsp" style="color:'+bk.color+'">'+esc(bk.space)+'</div>'
    +'</div>';
}

async function main() {
  const now = new Date();
  const all = [];
  for (const space of SPACES) {
    try {
      const events = parseIcal(await fetchUrl(space.url), space.name, space.color);
      all.push(...events);
      console.log('Fetched '+events.length+' for '+space.name);
    } catch(e) { console.error('Failed '+space.name+':',e.message); }
  }
  all.sort((a,b) => a.start - b.start);

  const sot = new Date(now); sot.setHours(0,0,0,0);
  const eot = new Date(sot); eot.setDate(eot.getDate()+1);
  const cut = new Date(sot); cut.setDate(cut.getDate()+DAYS_AHEAD);
  const tom = new Date(sot); tom.setDate(tom.getDate()+1);
  const todayKey = fmtDayKey(now);
  const tomKey   = fmtDayKey(tom);

  const todayBks  = all.filter(b => b.start >= sot && b.start < eot);
  const futureBks = all.filter(b => b.start >= eot && b.start < cut);

  // Today HTML
  let todayHtml = '';
  if (todayBks.length === 0) {
    todayHtml = '<div class="none">No bookings today</div>';
  } else {
    todayBks.forEach(b => { todayHtml += row(b, b.start <= now && b.end > now); });
  }

  // Future HTML grouped by day
  let futureHtml = '';
  let lastKey = '', curGroup = null;
  const groups = [];
  futureBks.forEach(b => {
    const k = fmtDayKey(b.start);
    if (k !== lastKey) { lastKey=k; curGroup={key:k,date:b.start,bks:[]}; groups.push(curGroup); }
    curGroup.bks.push(b);
  });
  groups.forEach(g => {
    const isTom = g.key === tomKey;
    futureHtml += '<div class="dhdr'+(isTom?' tom':'')+'">'
      +(isTom?'<span class="dpill">TOMORROW</span>':'')
      +'<span class="dday">'+DAYS[g.date.getDay()]+'</span>'
      +' <span class="ddate">'+g.date.getDate()+' '+MSHORT[g.date.getMonth()]+'</span>'
      +'</div>';
    g.bks.forEach(b => { futureHtml += row(b, false); });
  });
  if (!futureHtml) futureHtml = '<div class="none">No further bookings in the next '+DAYS_AHEAD+' days</div>';

  const monthLabel = MONTHS[now.getMonth()]+' '+now.getFullYear();
  const updatedStr = fmtTime(now);
  const totalCount = todayBks.length + futureBks.length;

  // Build HTML as a single template string written via fs
  // Using a JS array of lines to avoid any quoting issues
  const lines = [];
  lines.push('<!DOCTYPE html>');
  lines.push('<html><head>');
  lines.push('<meta charset="UTF-8">');
  lines.push('<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">');
  lines.push('<meta name="apple-mobile-web-app-capable" content="yes">');
  lines.push('<meta name="apple-mobile-web-app-status-bar-style" content="black">');
  lines.push('<title>Gemco Venue Bookings</title>');
  lines.push('<style>');
  lines.push('html,body{margin:0;padding:0;background:#09090b;color:#f0ece4;font-family:Arial,Helvetica,sans-serif;height:100%;overflow:hidden;}');
  lines.push('#hdr{background:#111116;border-bottom:3px solid #f0b429;padding:14px 24px;overflow:hidden;}');
  lines.push('#hl{float:left;}');
  lines.push('#hr{float:right;text-align:right;}');
  lines.push('#vn{font-size:44px;font-weight:bold;color:#fff;line-height:1;margin:0;}');
  lines.push('#vs{font-size:11px;letter-spacing:6px;text-transform:uppercase;color:#f0b429;margin-top:4px;}');
  lines.push('#ml{display:inline-block;background:#1e1a00;border:1px solid #f0b429;color:#f0b429;font-size:13px;letter-spacing:3px;text-transform:uppercase;padding:3px 12px;border-radius:20px;margin-top:7px;}');
  lines.push('#ck{font-size:52px;font-weight:300;color:#fff;line-height:1;}');
  lines.push('#dl{font-size:14px;color:#aaa;margin-top:4px;}');
  lines.push('#upd{font-size:11px;color:#555;margin-top:2px;}');
  lines.push('#tp{background:#111116;border-bottom:3px solid #f0b429;padding:0 20px 10px;max-height:35vh;overflow-y:auto;}');
  lines.push('.thdr{padding:12px 8px 8px;overflow:hidden;border-bottom:2px solid #f0b429;margin-bottom:8px;}');
  lines.push('.tpill{display:inline-block;background:#f0b429;color:#000;font-size:13px;font-weight:bold;letter-spacing:2px;padding:3px 12px;border-radius:4px;margin-right:10px;vertical-align:middle;}');
  lines.push('.tday{font-size:26px;font-weight:bold;color:#fff;vertical-align:middle;margin-right:8px;}');
  lines.push('.tdate{font-size:22px;font-weight:bold;color:#f0b429;vertical-align:middle;}');
  lines.push('#fl{background:#0d0d10;border-bottom:1px solid #2a2a30;padding:8px 24px;overflow:hidden;}');
  lines.push('#flt{float:left;font-size:20px;font-weight:bold;color:#aaa;line-height:28px;}');
  lines.push('#flr{float:right;}');
  lines.push('.badge{font-size:13px;color:#f0b429;border:1px solid #7a6230;padding:4px 14px;border-radius:14px;display:inline-block;background:#1a1400;}');
  lines.push('#sa{overflow-y:scroll;background:#09090b;}');
  lines.push('#sl{padding:6px 20px 80px;}');
  lines.push('.dhdr{padding:14px 8px 7px;margin-bottom:4px;overflow:hidden;border-bottom:1px solid #2a2a2a;}');
  lines.push('.tom{border-bottom:2px solid #888;}');
  lines.push('.dpill{display:inline-block;background:#555;color:#fff;font-size:13px;font-weight:bold;letter-spacing:2px;padding:3px 12px;border-radius:4px;margin-right:10px;vertical-align:middle;}');
  lines.push('.dday{font-size:24px;font-weight:bold;color:#aaa;vertical-align:middle;}');
  lines.push('.tom .dday{color:#ddd;}');
  lines.push('.ddate{font-size:20px;font-weight:bold;color:#666;vertical-align:middle;}');
  lines.push('.tom .ddate{color:#aaa;}');
  lines.push('.brow{background:#18181c;border-radius:8px;margin-bottom:7px;padding:12px 14px;overflow:hidden;}');
  lines.push('.now{background:#1c1800;}');
  lines.push('.bt{float:left;width:150px;}');
  lines.push('.bs{font-size:26px;font-weight:bold;color:#fff;display:block;line-height:1.1;}');
  lines.push('.be{font-size:14px;color:#666;display:block;margin-top:3px;}');
  lines.push('.bm{margin-left:166px;margin-right:155px;padding-top:3px;}');
  lines.push('.bi{font-size:23px;font-weight:bold;color:#f0ece4;display:block;line-height:1.2;}');
  lines.push('.bsp{float:right;font-size:17px;font-weight:bold;text-align:right;width:145px;padding-top:5px;}');
  lines.push('.nb{display:inline-block;font-size:12px;background:#f0b429;color:#000;font-weight:bold;padding:2px 10px;border-radius:4px;margin-left:10px;vertical-align:middle;}');
  lines.push('.none{font-size:18px;color:#555;padding:10px 8px;font-style:italic;}');
  lines.push('</style></head><body>');

  // Header
  lines.push('<div id="hdr">');
  lines.push('<div id="hl"><div id="vn">Gemco</div><div id="vs">Venue Bookings</div><div id="ml">'+monthLabel+'</div></div>');
  lines.push('<div id="hr"><div id="ck">--:--</div><div id="dl"></div><div id="upd">Updated '+updatedStr+'</div></div>');
  lines.push('<div style="clear:both"></div></div>');

  // Today panel
  lines.push('<div id="tp">');
  lines.push('<div class="thdr"><span class="tpill">TODAY</span><span class="tday">'+DAYS[now.getDay()]+'</span><span class="tdate">'+now.getDate()+' '+MSHORT[now.getMonth()]+'</span></div>');
  lines.push(todayHtml);
  lines.push('</div>');

  // Future label
  lines.push('<div id="fl"><div id="flt">Coming Up &mdash; Next 2 Weeks</div><div id="flr"><span class="badge">'+futureBks.length+' events</span></div><div style="clear:both"></div></div>');

  // Scrolling area
  lines.push('<div id="sa"><div id="sl">'+futureHtml+'</div></div>');

  // Script
  lines.push('<script>');
  lines.push('// Clock');
  lines.push('function uc(){var n=new Date(),h=n.getHours(),m=n.getMinutes(),ap=h>=12?"pm":"am";h=h%12;if(!h)h=12;document.getElementById("ck").innerHTML=h+":"+(m<10?"0"+m:m)+" "+ap;var D=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],M=["January","February","March","April","May","June","July","August","September","October","November","December"];document.getElementById("dl").innerHTML=D[n.getDay()]+" "+n.getDate()+" "+M[n.getMonth()]+" "+n.getFullYear();}');
  lines.push('setInterval(uc,1000);uc();');
  lines.push('// Size scroll area to fill remaining screen');
  lines.push('var sa=document.getElementById("sa");');
  lines.push('var ph=window.innerHeight||document.documentElement.clientHeight||768;');
  lines.push('var used=document.getElementById("hdr").offsetHeight+document.getElementById("tp").offsetHeight+document.getElementById("fl").offsetHeight;');
  lines.push('sa.style.height=(ph-used)+"px";');
  lines.push('// Auto scroll');
  lines.push('var sp=0,paused=0;');
  lines.push('setInterval(function(){');
  lines.push('  if(paused>0){paused--;if(paused===0){sp=0;sa.scrollTop=0;}return;}');
  lines.push('  var mx=sa.scrollHeight-sa.clientHeight;');
  lines.push('  if(mx<=0)return;');
  lines.push('  sp+=1.5;');
  lines.push('  if(sp>=mx){sp=mx;paused=150;}');
  lines.push('  sa.scrollTop=sp;');
  lines.push('},30);');
  lines.push('<\/script>');
  lines.push('// Auto reload');
lines.push('function scheduleReload(){');
lines.push('  var n=new Date();');
lines.push('  // Reload at next midnight');
lines.push('  var midnight=new Date(n);midnight.setHours(24,0,0,0);');
lines.push('  var msToMidnight=midnight-n;');
lines.push('  setTimeout(function(){location.reload();},msToMidnight);');
lines.push('  // Also reload every 30 minutes to pick up fresh data');
lines.push('  setInterval(function(){location.reload();},30*60*1000);');
lines.push('}');
lines.push('scheduleReload();');
  lines.push('</body></html>');

  fs.writeFileSync('index.html', lines.join('\n'));
  console.log('Written — today:'+todayBks.length+' future:'+futureBks.length);
}

main().catch(e => { console.error(e); process.exit(1); });
