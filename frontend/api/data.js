// api/data.js
import { kv } from "@vercel/kv";

const KEY = "gas:data";

export default async function handler(req, res) {
  // ---------- GET ----------
  if (req.method === "GET") {
    try {
      const data = await kv.get(KEY);
      return res.status(200).json(data ?? { tables: {} });
    } catch (e) {
      console.error("KV GET error:", e);
      return res.status(500).json({ error: "read failed" });
    }
  }

  // ---------- POST (เขียนทับทั้งก้อน) ----------
  if (req.method === "POST") {
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      if (!body || typeof body !== "object" || !body.tables) {
        return res.status(400).json({ error: "body must be { tables: {...} }" });
      }

      await kv.set(KEY, body);
      return res.json({ ok: true, savedAt: Date.now() });
    } catch (e) {
      console.error("KV SET error:", e);
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
