// api/data.js
// ใช้ Vercel Blob REST API โดยตรงผ่าน fetch (ไม่ต้องติดตั้ง package)

const BLOB_TOKEN =
  process.env.BLOB_READ_WRITE_TOKEN ||
  "vercel_blob_rw_m4VrIT5HpJQaWumO_d1Y9BZ9jOZmilVgMzKoA2LYBl12ahs";

const BLOB_KEY = "gas-system-data.json";
const BLOB_API = "https://blob.vercel-storage.com";

async function findBlobUrl() {
  const r = await fetch(`${BLOB_API}/?prefix=${encodeURIComponent(BLOB_KEY)}`, {
    headers: {
      Authorization: `Bearer ${BLOB_TOKEN}`,
      "x-api-version": "7",
    },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json();
  const hit = (j.blobs || []).find((b) => b.pathname === BLOB_KEY);
  return hit ? hit.url : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();

  // ---------- GET ----------
  if (req.method === "GET") {
    try {
      const url = await findBlobUrl();
      if (!url) return res.status(200).json({ tables: {} });

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return res.status(200).json({ tables: {} });

      const text = await r.text();
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(text);
    } catch {
      return res.status(200).json({ tables: {} });
    }
  }

  // ---------- POST ----------
  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body !== "string") body = JSON.stringify(body ?? {});
      JSON.parse(body); // validate JSON

      const r = await fetch(`${BLOB_API}/${BLOB_KEY}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${BLOB_TOKEN}`,
          "x-api-version": "7",
          "x-content-type": "application/json",
          "x-add-random-suffix": "0",
          "x-allow-overwrite": "1",
          "Content-Type": "application/json",
        },
        body,
      });

      if (!r.ok) {
        const t = await r.text();
        return res.status(400).json({ error: t || "blob upload failed" });
      }

      const j = await r.json().catch(() => ({}));
      return res.json({ ok: true, savedAt: Date.now(), url: j.url });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  res.status(405).end();
}
