// api/data.js
import { kv } from "@vercel/kv";

const KEY = "gas_system_data";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const data = await kv.get(KEY);
      return res.status(200).json(data || { tables: {} });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      // validate ว่าเป็น object
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "Invalid JSON body" });
      }

      await kv.set(KEY, body);
      return res.json({ ok: true, savedAt: Date.now() });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  res.status(405).end();
}
