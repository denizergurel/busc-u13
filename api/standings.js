// /api/standings.js — BUSC U13 Standings
// Data priority: Upstash KV → Live PDF → Live HTML → Verified fallback

const PDF_URL  = "https://system.gotsport.com/org_event/events/49370/schedule_pdf.pdf?group_id=436213";
const HTML_URL = "https://system.gotsport.com/org_event/events/49370/results?group=436213";

const FALLBACK_TEAMS = [
  { pos:"1", team:"Ballistic United BUSC 2013 Elite 1",    mp:"6", w:"6", l:"0", d:"0", gf:"22", ga:"5",  gd:"+17", pts:"18", isBallistic:true  },
  { pos:"2", team:"Mustang SC Chargers 13M",               mp:"7", w:"6", l:"1", d:"0", gf:"15", ga:"5",  gd:"+10", pts:"18", isBallistic:false },
  { pos:"3", team:"Diablo Valley FC 13B Black",            mp:"6", w:"3", l:"3", d:"0", gf:"14", ga:"17", gd:"-3",  pts:"9",  isBallistic:false },
  { pos:"4", team:"Livermore Fusion SC 2013 Boys Gold",    mp:"6", w:"2", l:"2", d:"2", gf:"13", ga:"7",  gd:"+7",  pts:"8",  isBallistic:false },
  { pos:"5", team:"Dublin United 13B Black",               mp:"7", w:"2", l:"4", d:"1", gf:"10", ga:"15", gd:"-6",  pts:"7",  isBallistic:false },
  { pos:"6", team:"Mustang SC Quakes 13M",                 mp:"5", w:"1", l:"3", d:"1", gf:"4",  ga:"9",  gd:"-5",  pts:"4",  isBallistic:false },
  { pos:"7", team:"Mt. Diablo Mustang 2013B Black III",    mp:"5", w:"1", l:"3", d:"1", gf:"6",  ga:"14", gd:"-8",  pts:"4",  isBallistic:false },
  { pos:"8", team:"Mt. Diablo Mustang 2013B Black II",     mp:"8", w:"1", l:"6", d:"1", gf:"7",  ga:"19", gd:"-12", pts:"4",  isBallistic:false }
];

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.google.com/",
  "Cache-Control": "no-cache"
};

// Upstash Redis REST client (no npm package needed)
async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${key}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_READ_ONLY_TOKEN}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── 1. Upstash KV cache ────────────────────────────────────────────────────
  try {
    const cached = await kvGet("busc_u13_standings");
    if (cached && cached.teams && cached.teams.length >= 4) {
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      return res.status(200).json({ ...cached, source: "kv-cache" });
    }
  } catch (e) {
    console.log("KV read failed:", e.message);
  }

  // ── 2. Live PDF ────────────────────────────────────────────────────────────
  try {
    const r = await fetch(PDF_URL, {
      headers: { ...FETCH_HEADERS, Accept: "application/pdf,*/*" },
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok && (r.headers.get("content-type") || "").includes("pdf")) {
      const buf = await r.arrayBuffer();
      const teams = parsePdf(buf);
      if (teams && teams.length >= 4) {
        return res.status(200).json({ updatedAt: new Date().toISOString(), source: "live-pdf", division: "U13 Boys - Bronze - Region 3", teams });
      }
    }
  } catch (e) { console.log("PDF fetch failed:", e.message); }

  // ── 3. Live HTML ───────────────────────────────────────────────────────────
  try {
    const r = await fetch(HTML_URL, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok) {
      const html = await r.text();
      if (html.length > 500) {
        const teams = parseHtml(html);
        if (teams && teams.length >= 4) {
          return res.status(200).json({ updatedAt: new Date().toISOString(), source: "live-html", division: "U13 Boys - Bronze - Region 3", teams });
        }
      }
    }
  } catch (e) { console.log("HTML fetch failed:", e.message); }

  // ── 4. Verified fallback ───────────────────────────────────────────────────
  res.setHeader("Cache-Control", "s-maxage=60");
  return res.status(200).json({
    updatedAt: "2026-05-02T16:14:00-07:00",
    source: "fallback",
    division: "U13 Boys - Bronze - Region 3",
    teams: FALLBACK_TEAMS
  });
}

function parsePdf(buf) {
  try {
    const bytes = new Uint8Array(buf);
    let text = "";
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c >= 32 && c < 127) text += String.fromCharCode(c);
      else if (c === 10 || c === 13) text += "\n";
    }
    const streams = text.match(/BT([\s\S]*?)ET/g) || [];
    const raw = streams.map(s =>
      s.replace(/BT|ET/g, "").replace(/\(([^)]+)\)/g, "$1 ")
       .replace(/Tj|TD|Tm|Tf|[0-9. -]+/g, " ").trim()
    ).join("\n");
    return parseRows(raw);
  } catch (e) { return null; }
}

function parseHtml(html) {
  try {
    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
    let best = [];
    for (const table of tables) {
      const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      const found = [];
      for (const row of rows) {
        const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
          .map(td => td.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
        if (cells.length >= 9 && /^\d{1,2}$/.test(cells[0])) {
          found.push({ pos:cells[0], team:cells[1], mp:cells[2], w:cells[3], l:cells[4], d:cells[5], gf:cells[6], ga:cells[7], gd:cells[8], pts:cells[9]||cells[cells.length-1], isBallistic:cells[1].toLowerCase().includes("ballistic") });
        }
      }
      if (found.length > best.length) best = found;
    }
    return best.length > 0 ? best : null;
  } catch (e) { return null; }
}

function parseRows(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const teams = [];
  const pat = /^(\d{1,2})\s+([\w\s'.&-]{3,50}?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\d+)$/;
  for (const line of lines) {
    const m = line.match(pat);
    if (m) teams.push({ pos:m[1], team:m[2].trim(), mp:m[3], w:m[4], l:m[5], d:m[6], gf:m[7], ga:m[8], gd:m[9], pts:m[10], isBallistic:m[2].toLowerCase().includes("ballistic") });
  }
  return teams.length >= 4 ? teams : null;
}
