// Passerelle Mechanic — Unique Plastique
// Le jeton Mechanic ne quitte jamais Render. Claude n'obtient qu'une clé de passerelle,
// révocable en changeant une variable d'environnement.

const http = require("http");

const MECHANIC_TOKEN = process.env.MECHANIC_API_TOKEN;
const PROXY_KEY      = process.env.PROXY_KEY;
const UPSTREAM       = "https://api.mechanic.dev";
const PORT           = process.env.PORT || 10000;

if (!MECHANIC_TOKEN || !PROXY_KEY) {
  console.error("Il manque MECHANIC_API_TOKEN ou PROXY_KEY.");
  process.exit(1);
}

// Surface autorisée : uniquement les tâches, le preview et l'état de la boutique.
// Tout le reste est refusé, y compris les globals et les secrets.
const ALLOW = [
  { m: ["GET"],        re: /^\/v1\/shop\/status$/ },
  { m: ["GET", "POST"], re: /^\/v1\/tasks$/ },
  { m: ["POST"],       re: /^\/v1\/tasks\/preview$/ },
  { m: ["GET", "PUT"],  re: /^\/v1\/tasks\/[A-Za-z0-9_-]+$/ },
  { m: ["POST"],       re: /^\/v1\/tasks\/[A-Za-z0-9_-]+\/preview$/ },
  { m: ["GET"],        re: /^\/v1\/auth\/verify$/ },
];

function timingSafeEqual(a, b) {
  const crypto = require("crypto");
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (req.url === "/" || req.url === "/health") return send(200, { ok: true });

  if (!timingSafeEqual(req.headers["x-proxy-key"] || "", PROXY_KEY)) {
    return send(401, { error: "cle de passerelle invalide" });
  }

  const path = req.url.split("?")[0];
  const permitted = ALLOW.some(r => r.m.includes(req.method) && r.re.test(path));
  if (!permitted) return send(403, { error: "chemin ou methode non autorise", path, method: req.method });

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);

  try {
    const upstream = await fetch(UPSTREAM + req.url, {
      method: req.method,
      headers: {
        authorization: `Bearer ${MECHANIC_TOKEN}`,
        "content-type": req.headers["content-type"] || "application/json",
        accept: "application/json",
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
    res.end(text);
  } catch (err) {
    send(502, { error: "echec de la requete vers Mechanic", detail: String(err) });
  }
});

server.listen(PORT, () => console.log(`passerelle Mechanic a l'ecoute sur ${PORT}`));
