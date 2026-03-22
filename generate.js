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

function fmtDay(d) {
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
}
function fmtTime(d) { return d.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',hour12:true}); }
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

  // Group by date
  var groups = [];
  var lastDate = '';
  var currentGroup = null;
  for (var i = 0; i < upcoming.length; i++) {
    var bk = upcoming[i];
    var dateKey = fmtDay(bk.start);
    if (dateKey !== lastDate) {
      lastDate = dateKey;
      currentGroup = { date: dateKey, bookings: [] };
      groups.push(currentGroup);
    }
    currentGroup.bookings.push(bk);
  }

  // Build list HTML
  var listHtml = '';
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g];
    var isToday = fmtDay(now) === grp.date;
    var isTomorrow = (function(){
      var tm = new Date(now); tm.setDate(tm.getDate()+1);
      return fmtDay(tm) === grp.date;
    })();

    var dateLabel = grp.date;
    if (isToday) dateLabel = 'TODAY &mdash; ' + grp.date;
    else if (isTomorrow) dateLabel = 'TOMORROW &mdash; ' + grp.date;

    listHtml += '<div class="date-hdr'+(isToday?' today-hdr':'')+'">'+dateLabel+'</div>';

    for (var b = 0; b < grp.bookings.length; b++) {
      var bk = grp.bookings[b];
      var isNow = bk.start <= now && bk.end > now;
      var rowStyle = 'border-left:6px solid '+bk.color+';background:'+(isNow?'#1c1700':'#141416')+';';
      listHtml += '<div class="brow" style="'+rowStyle+'">'
        + '<div class="btime"><span class="bstart">'+fmtTime(bk.start)+'</span><span class="bend">&ndash; '+fmtTime(bk.end)+'</span></div>'
        + '<div class="btitle">'+esc(bk.title)+(isNow?' <span class="nowbadge">NOW</span>':'')+'</div>'
        + '<div class="bspace" style="color:'+bk.color+'">'+esc(bk.space)+'</div>'
        + '</div>';
    }
  }

  if (!listHtml) listHtml = '<div class="empty">No upcoming bookings</div>';

  var updatedStr = fmtTime(now);
  var countStr = upcoming.length + ' events';

  // Clock vars for JS
  var html = '<!DOCTYPE html>\n'
    + '<html><head>\n'
    + '<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">\n'
    + '<title>Gemco Venue Bookings</title>\n'
    + '<style>\n'
    + 'html,body{margin:0;padding:0;background:#0d0d0f;color:#e8e4dc;font-family:Arial,Helvetica,sans-serif;height:100%;overflow:hidden;}\n'
    + '#page{height:100vh;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-flex-direction:column;flex-direction:column;}\n'
    + '#hdr{background:#111114;padding:14px 24px;border-bottom:2px solid #c9a84c;overflow:hidden;-webkit-box-flex:0;-webkit-flex:0 0 auto;flex:0 0 auto;}\n'
    + '#hdr-left{float:left;}\n'
    + '#hdr-right{float:right;text-align:right;}\n'
    + '#vname{font-size:42px;font-weight:bold;color:#e8e4dc;line-height:1;margin:0;}\n'
    + '#vsub{font-size:13px;letter-spacing:5px;text-transform:uppercase;color:#c9a84c;margin-top:5px;}\n'
    + '#clock{font-size:52px;font-weight:300;color:#e8e4dc;line-height:1;letter-spacing:2px;}\n'
    + '#dateline{font-size:15px;color:#888;margin-top:4px;}\n'
    + '#meta{background:#0d0d0f;padding:8px 24px;border-bottom:1px solid #222;overflow:hidden;-webkit-box-flex:0;-webkit-flex:0 0 auto;flex:0 0 auto;}\n'
    + '#meta-left{float:left;font-size:22px;font-weight:bold;color:#e8e4dc;line-height:32px;}\n'
    + '#meta-right{float:right;text-align:right;}\n'
    + '.badge{font-size:14px;color:#c9a84c;border:1px solid #7a6230;padding:4px 12px;border-radius:12px;display:inline-block;}\n'
    + '.upd{font-size:12px;color:#555;display:block;margin-bottom:3px;}\n'
    + '#scroll-area{-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;overflow:hidden;position:relative;}\n'
    + '#list{padding:0 16px 40px;}\n'
    + '.date-hdr{font-size:15px;letter-spacing:3px;text-transform:uppercase;color:#7a6230;padding:16px 8px 6px;border-bottom:1px solid #222;margin-bottom:4px;}\n'
    + '.today-hdr{color:#c9a84c;letter-spacing:3px;}\n'
    + '.brow{padding:14px 16px;margin-bottom:6px;border-radius:6px;overflow:hidden;}\n'
    + '.btime{float:left;width:160px;}\n'
    + '.bstart{font-size:22px;font-weight:bold;color:#e8e4dc;display:block;line-height:1.2;}\n'
    + '.bend{font-size:15px;color:#666;display:block;margin-top:2px;}\n'
    + '.btitle{margin-left:176px;margin-right:140px;font-size:22px;font-weight:bold;color:#e8e4dc;line-height:1.3;padding-top:4px;}\n'
    + '.bspace{float:right;font-size:15px;font-weight:bold;text-align:right;padding-top:8px;width:130px;}\n'
    + '.nowbadge{font-size:12px;background:#c9a84c;color:#000;padding:2px 8px;border-radius:3px;margin-left:8px;vertical-align:middle;}\n'
    + '.empty{font-size:20px;color:#555;text-align:center;padding:60px;}\n'
    + '</style>\n'
    + '</head><body>\n'
    + '<div id="page">\n'
    + '  <div id="hdr">\n'
    + '    <div id="hdr-left"><div id="vname">Gemco</div><div id="vsub">Venue Bookings</div></div>\n'
    + '    <div id="hdr-right"><div id="clock">--:--</div><div id="dateline"></div></div>\n'
    + '    <div style="clear:both"></div>\n'
    + '  </div>\n'
    + '  <div id="meta">\n'
    + '    <div id="meta-left">Upcoming Bookings</div>\n'
    + '    <div id="meta-right"><span class="upd">Updated '+updatedStr+'</span><span class="badge">'+countStr+'</span></div>\n'
    + '    <div style="clear:both"></div>\n'
    + '  </div>\n'
    + '  <div id="scroll-area">\n'
    + '    <div id="list">'+listHtml+'</div>\n'
    + '  </div>\n'
    + '</div>\n'
    + '<script>\n'
    + 'function updateClock(){\n'
    + '  var n=new Date(),h=n.getHours(),m=n.getMinutes(),ampm=h>=12?"pm":"am";\n'
    + '  h=h%12;if(h===0)h=12;\n'
    + '  document.getElementById("clock").innerHTML=h+":"+(m<10?"0"+m:m)+" "+ampm;\n'
    + '  var days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];\n'
    + '  var months=["January","February","March","April","May","June","July","August","September","October","November","December"];\n'
    + '  document.getElementById("dateline").innerHTML=days[n.getDay()]+" "+n.getDate()+" "+months[n.getMonth()]+" "+n.getFullYear();\n'
    + '}\n'
    + 'setInterval(updateClock,1000); updateClock();\n'
    + 'var sp=0,sa=document.getElementById("scroll-area"),li=document.getElementById("list");\n'
    + 'setInterval(function(){\n'
    + '  var mx=li.offsetHeight-sa.offsetHeight+40;\n'
    + '  if(mx<=0){sp=0;return;}\n'
    + '  sp+=100;\n'
    + '  if(sp>=mx)sp=0;\n'
    + '  li.style.marginTop="-"+sp+"px";\n'
    + '},4000);\n'
    + '</script>\n'
    + '</body></html>\n';

  fs.writeFileSync('index.html', html);
  console.log('Written index.html with ' + upcoming.length + ' upcoming bookings');
}

main().catch(e => { console.error(e); process.exit(1); });
