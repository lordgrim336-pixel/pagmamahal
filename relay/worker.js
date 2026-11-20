// Pagmamahal report relay (Cloudflare Workers, free plan).
//
// The app is a static site and can't hold a key that writes to the repository,
// so it sends "Pin in the wrong place?" reports here. This relay:
//   1. accepts reports only from the app's own website (CORS)
//   2. checks Cloudflare Turnstile (invisible bot check) and a hidden honeypot field
//   3. limits reports per day overall and per visitor (visitor = salted hash of
//      the IP address; the IP itself is never stored)
//   4. saves the report as data/inbox/<id>.json in the GitHub repository, which
//      starts the "Process pin reports" workflow.
//
// Secrets (set with `npx wrangler secret put NAME`):
//   GITHUB_TOKEN      fine-grained token: this repo only, Contents read & write
//   TURNSTILE_SECRET  Turnstile widget secret key
//   IP_SALT           any long random text
// Settings: see wrangler.toml [vars]. Optional KV namespace REPORTS for limits.

const json = (body, status, cors) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function bump(env, key, max) {
  if (!env.REPORTS) return true; // no KV bound: rely on Turnstile only
  const n = Number((await env.REPORTS.get(key)) || 0);
  if (n >= max) return false;
  await env.REPORTS.put(key, String(n + 1), { expirationTtl: 2 * 86400 });
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
      : {};

    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== "/report" || request.method !== "POST") return json({ ok: false, error: "Not found" }, 404, cors);
    if (!cors["Access-Control-Allow-Origin"]) return json({ ok: false, error: "Not allowed" }, 403, cors);

    // ---- read and validate
    const raw = await request.text();
    if (raw.length > 4000) return json({ ok: false, error: "Too large" }, 413, cors);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Bad request" }, 400, cors);
    }
    if (body.website) return json({ ok: true }, 200, cors); // honeypot filled: pretend success, drop it
    const propertyId = String(body.propertyId ?? "").replace(/[^0-9]/g, "").slice(0, 20);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!propertyId || !(lat >= 4 && lat <= 22) || !(lng >= 116 && lng <= 127.5))
      return json({ ok: false, error: "Missing property or location" }, 400, cors);

    // ---- bot check
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET || "");
    form.append("response", String(body.token || ""));
    if (ip) form.append("remoteip", ip);
    const ts = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })).json();
    if (!ts.success) return json({ ok: false, error: "Bot check failed. Please try again." }, 403, cors);

    // ---- limits
    const day = new Date().toISOString().slice(0, 10);
    const visitor = (await sha256(`${env.IP_SALT || ""}|${ip}`)).slice(0, 24);
    if (!(await bump(env, `day:${day}`, Number(env.DAILY_CAP || 200))))
      return json({ ok: false, error: "We've received many reports today. Please try again tomorrow." }, 429, cors);
    if (!(await bump(env, `visitor:${day}:${visitor}`, Number(env.PER_VISITOR_DAILY_CAP || 10))))
      return json({ ok: false, error: "Thanks! You've sent the most reports allowed today." }, 429, cors);

    // ---- save to the repository inbox
    const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
    const report = {
      id,
      propertyId,
      coords: [Number(lat.toFixed(6)), Number(lng.toFixed(6))],
      wholeSubdivision: body.wholeSubdivision === true,
      note: String(body.note ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, 500),
      visitor, // salted hash, used only to spot repeat reporters
      receivedAt: new Date().toISOString(),
    };
    if (env.DRY_RUN === "1") return json({ ok: true, id, dryRun: true, report }, 200, cors);

    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/inbox/${id}.json`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "pagmamahal-report-relay",
      },
      body: JSON.stringify({ message: `Pin report ${id}`, content: toBase64(JSON.stringify(report, null, 2) + "\n"), branch: "main" }),
    });
    if (!res.ok) return json({ ok: false, error: "Couldn't save the report. Please try again later." }, 502, cors);
    return json({ ok: true, id }, 200, cors);
  },
};
