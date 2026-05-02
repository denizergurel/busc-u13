const GOTSPORT_URL = “https://system.gotsport.com/org_event/events/49370/results?group=436213”;

const FALLBACK_TEAMS = [
{ pos:“1”, team:“Ballistic United BUSC 2013 Elite 1”, mp:“6”, w:“6”, l:“0”, d:“0”, gf:“22”, ga:“5”, gd:”+17”, pts:“18”, isBallistic:true },
{ pos:“2”, team:“Mustang SC Chargers 13M”, mp:“7”, w:“6”, l:“1”, d:“0”, gf:“15”, ga:“5”, gd:”+10”, pts:“18”, isBallistic:false },
{ pos:“3”, team:“Diablo Valley FC 13B Black”, mp:“6”, w:“3”, l:“3”, d:“0”, gf:“14”, ga:“17”, gd:”-3”, pts:“9”, isBallistic:false },
{ pos:“4”, team:“Livermore Fusion SC 2013 Boys Gold”, mp:“6”, w:“2”, l:“2”, d:“2”, gf:“13”, ga:“7”, gd:”+7”, pts:“8”, isBallistic:false },
{ pos:“5”, team:“Dublin United 13B Black”, mp:“7”, w:“2”, l:“4”, d:“1”, gf:“10”, ga:“15”, gd:”-6”, pts:“7”, isBallistic:false },
{ pos:“6”, team:“Mustang SC Quakes 13M”, mp:“5”, w:“1”, l:“3”, d:“1”, gf:“4”, ga:“9”, gd:”-5”, pts:“4”, isBallistic:false },
{ pos:“7”, team:“Mt. Diablo Mustang 2013B Black III”, mp:“5”, w:“1”, l:“3”, d:“1”, gf:“6”, ga:“14”, gd:”-8”, pts:“4”, isBallistic:false },
{ pos:“8”, team:“Mt. Diablo Mustang 2013B Black II”, mp:“8”, w:“1”, l:“6”, d:“1”, gf:“7”, ga:“19”, gd:”-12”, pts:“4”, isBallistic:false }
];

export default async function handler(req, res) {
res.setHeader(“Access-Control-Allow-Origin”, “*”);
res.setHeader(“Access-Control-Allow-Methods”, “GET, OPTIONS”);

if (req.method === “OPTIONS”) {
return res.status(200).end();
}

let teams = null;
let source = “cached”;

try {
const response = await fetch(GOTSPORT_URL, {
headers: {
“User-Agent”: “Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1”,
“Accept”: “text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8”,
“Accept-Language”: “en-US,en;q=0.9”,
“Referer”: “https://www.google.com/”
},
signal: AbortSignal.timeout(7000)
});

```
if (response.ok) {
  const html = await response.text();
  if (html.length > 500) {
    const parsed = parseTable(html);
    if (parsed && parsed.length >= 4) {
      teams = parsed;
      source = "live";
    }
  }
}
```

} catch (e) {
console.log(“Live fetch error:”, e.message);
}

res.setHeader(“Cache-Control”, “s-maxage=300, stale-while-revalidate=600”);
return res.status(200).json({
updatedAt: new Date().toISOString(),
source: source,
division: “U13 Boys - Bronze - Region 3”,
teams: teams || FALLBACK_TEAMS
});
}

function parseTable(html) {
try {
const tables = html.match(/<table[\s\S]*?</table>/gi) || [];
let best = [];

```
for (const table of tables) {
  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const found = [];

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(
      td => td.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );

    if (cells.length >= 9 && /^\d{1,2}$/.test(cells[0])) {
      found.push({
        pos: cells[0],
        team: cells[1],
        mp: cells[2],
        w: cells[3],
        l: cells[4],
        d: cells[5],
        gf: cells[6],
        ga: cells[7],
        gd: cells[8],
        pts: cells[9] || cells[cells.length - 1],
        isBallistic: cells[1].toLowerCase().includes("ballistic")
      });
    }
  }

  if (found.length > best.length) best = found;
}

return best.length > 0 ? best : null;
```

} catch (e) {
return null;
}
}
