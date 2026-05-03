// /api/cron.js — Nightly cron, runs 6am UTC daily
// Fetches GotSport and saves to Upstash KV

const PDF_URL  = "https://system.gotsport.com/org_event/events/49370/schedule_pdf.pdf?group_id=436213";
const HTML_URL = "https://system.gotsport.com/org_event/events/49370/results?group=436213";

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.google.com/",
  "Cache-Control": "no-cache"
};

// Upstash Redis REST client
async function kvSet(key, value, exSeconds) {
  const url = `${process.env.KV_REST_API_URL}/set/${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ value: JSON.stringify(value), ex: exSeconds })
  });
  return res.ok;
}

export default async function handler(req, res) {
  // Only allow Vercel cron scheduler
  if (!req.headers["x-vercel-cron"]) {
    return res.status(401).json({ error: "Unauthorized — cron only" });
  }

  let teams = null;
  let source = null;

  // Try PDF
  try {
    const r = await fetch(PDF_URL, {
      headers: { ...FETCH_HEADERS, Accept: "application/pdf,*/*" },
      signal: AbortSignal.timeout(10000)
    });
    if (r.ok && (r.headers.get("content-type") || "").includes("pdf")) {
      const buf = await r.arrayBuffer();
      const parsed = parsePdf(buf);
      if (parsed && parsed.length >= 4) { teams = parsed; source = "pdf"; }
    }
  } catch (e) { console.log("Cron PDF failed:", e.message); }

  // Try HTML
  if (!teams) {
    try {
      const r = await fetch(HTML_URL, {
        headers: FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10000)
      });
      if (r.ok) {
        const html = await r.text();
        const parsed = parseHtml(html);
        if (parsed && parsed.length >= 4) { teams = parsed; source = "html"; }
      }
    } catch (e) { console.log("Cron HTML failed:", e.message); }
  }

  if (teams) {
    const record = {
      updatedAt: new Date().toISOString(),
      source,
      division: "U13 Boys - Bronze - Region 3",
      teams
    };
    await kvSet("busc_u13_standings", record, 60 * 60 * 48); // 48hr TTL
    console.log(`Cron saved ${teams.length} teams via ${source}`);
    return res.status(200).json({ ok: true, source, count: teams.length });
  }

  return res.status(200).json({ ok: false, message: "Could not fetch — KV unchanged" });
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
