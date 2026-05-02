// Vercel Serverless Function — BUSC U13 Standings
// Tries GotSport live, falls back to last known good data

const GOTSPORT_URL =
  "https://system.gotsport.com/org_event/events/49370/results?group=436213";

// Last known standings — verified April 26 2026 via ChatGPT browser retrieval
// Update this object manually after each game day if live fetch fails
const FALLBACK = {
  updatedAt: "2026-04-26T12:00:00-07:00",
  source: "cached",
  division: "U13 Boys · Bronze · Region 3",
  teams: [
    { pos:"1", team:"Mustang SC Chargers",               mp:"7", w:"6", l:"1", d:"0", gf:"-", ga:"-", gd:"-", pts:"18", isBallistic:false },
    { pos:"2", team:"Ballistic United BUSC 2013 Elite 1", mp:"5", w:"5", l:"0", d:"0", gf:"20", ga:"5",  gd:"+15",pts:"15", isBallistic:true  },
    { pos:"3", team:"Diablo Valley FC",                  mp:"5", w:"4", l:"1", d:"0", gf:"-", ga:"-", gd:"-", pts:"12", isBallistic:false },
    { pos:"4", team:"Dublin United",                     mp:"5", w:"3", l:"2", d:"0", gf:"-", ga:"-", gd:"-", pts:"9",  isBallistic:false },
    { pos:"5", team:"Mustang SC Quakes",                 mp:"5", w:"2", l:"2", d:"1", gf:"-", ga:"-", gd:"-", pts:"7",  isBallistic:false },
    { pos:"6", team:"Mt. Diablo Mustang II",             mp:"5", w:"1", l:"3", d:"1", gf:"-", ga:"-", gd:"-", pts:"4",  isBallistic:false },
    { pos:"7", team:"Livermore Fusion",                  mp:"5", w:"1", l:"4", d:"0", gf:"-", ga:"-", gd:"-", pts:"3",  isBallistic:false },
    { pos:"8", team:"IR Academy 13B",                    mp:"6", w:"0", l:"5", d:"1", gf:"-", ga:"-", gd:"-", pts:"1",  isBallistic:false },
  ]
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Try live fetch first
  try {
    const html = await fetchGotsport(GOTSPORT_URL);
    const standings = parseStandings(html);

    if (standings && standings.teams.length >= 4) {
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      return res.status(200).json({
        updatedAt: new Date().toISOString(),
        source: "live",
        division: standings.division,
        teams: standings.teams,
      });
    }
  } catch (err) {
    console.log("Live fetch failed:", err.message, "— returning fallback");
  }

  // Return fallback
  res.setHeader("Cache-Control", "s-maxage=60");
  return res.status(200).json(FALLBACK);
}

async function fetchGotsport(url) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Referer": "https://www.google.com/",
    "Cache-Control": "no-cache",
  };

  const resp = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  if (text.length < 500) throw new Error("Response too short");
  return text;
}

function parseStandings(html) {
  const divMatch = html.match(/<h[1-4][^>]*>([^<]*(?:Bronze|U13|Male)[^<]*)<\/h[1-4]>/i);
  const division = divMatch ? divMatch[1].trim() : "U13 Boys Bronze Region 3";

  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  let teams = [];

  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const candidates = [];

    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(td => td.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim());

      if (cells.length >= 6 && /^\d{1,2}$/.test(cells[0])) {
        candidates.push({
          pos: cells[0],
          team: cells[1],
          mp:  cells[2],
          w:   cells[3],
          l:   cells[4],
          d:   cells[5],
          gf:  cells[6] ?? "-",
          ga:  cells[7] ?? "-",
          gd:  cells[8] ?? "-",
          pts: cells[cells.length - 1],
          isBallistic: cells[1]?.toLowerCase().includes("ballistic"),
        });
      }
    }
    if (candidates.length > teams.length) teams = candidates;
  }

  return { division, teams };
}
