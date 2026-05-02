// Vercel Serverless Function
// Fetches GotSport standings page server-side (bypasses CORS + Cloudflare)

const GOTSPORT_URL =
  "https://system.gotsport.com/org_event/events/49370/results?group=436213";

export default async function handler(req, res) {
  // CORS — allow any origin so the PWA can call this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const html = await fetchWithRetry(GOTSPORT_URL);
    const standings = parseStandings(html);

    if (!standings || standings.teams.length === 0) {
      return res.status(502).json({
        error: "parse_failed",
        message: "Fetched page but could not parse standings table",
      });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      division: standings.division,
      teams: standings.teams,
    });
  } catch (err) {
    console.error("Standings fetch error:", err.message);
    return res.status(502).json({
      error: "fetch_failed",
      message: err.message,
    });
  }
}

// ─── Fetch with browser-like headers ──────────────────────────────────────────
async function fetchWithRetry(url, attempts = 3) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    Referer: "https://www.google.com/",
  };

  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, { headers, redirect: "follow" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      if (text.length < 500) throw new Error("Response too short — likely blocked");
      return text;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ─── Parse HTML standings table ────────────────────────────────────────────────
function parseStandings(html) {
  // Extract division name
  const divMatch =
    html.match(/<h[1-4][^>]*>\s*([^<]*Bronze[^<]*)\s*<\/h[1-4]>/i) ||
    html.match(/<h[1-4][^>]*>\s*([^<]*Male U13[^<]*)\s*<\/h[1-4]>/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const division = divMatch ? divMatch[1].trim() : "U13 Boys Bronze Region 3";

  // Find all table rows with team data
  // GotSport standings rows look like: <tr>...<td>1</td><td>Team Name</td><td>7</td>...
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];

  let teams = [];

  for (const table of tableMatch) {
    const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    const candidates = [];
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(
        (td) => td.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim()
      );

      // A valid standings row has 8-12 cells, first is a small number (rank)
      if (cells.length >= 6 && /^\d{1,2}$/.test(cells[0])) {
        candidates.push({
          pos: cells[0],
          team: cells[1],
          gp: cells[2],
          w: cells[3],
          l: cells[4],
          d: cells[5],
          gf: cells[6] ?? "-",
          ga: cells[7] ?? "-",
          gd: cells[8] ?? "-",
          pts: cells[cells.length - 1],
          isBallistic: cells[1]?.toLowerCase().includes("ballistic"),
        });
      }
    }

    if (candidates.length > teams.length) teams = candidates;
  }

  // Fallback: regex-based row extraction if table parsing failed
  if (teams.length === 0) {
    const rowRegex =
      /(\d{1,2})\s+([\w\s'.&-]{4,40}?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\d+)/g;
    let m;
    while ((m = rowRegex.exec(html)) !== null) {
      teams.push({
        pos: m[1],
        team: m[2].trim(),
        gp: m[3],
        w: m[4],
        l: m[5],
        d: m[6],
        gf: m[7],
        ga: m[8],
        gd: m[9],
        pts: m[10],
        isBallistic: m[2].toLowerCase().includes("ballistic"),
      });
    }
  }

  return { division, teams };
}
