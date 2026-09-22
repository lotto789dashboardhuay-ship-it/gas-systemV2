// api/data.js
import { put, head } from "@vercel/blob";

const BLOB_NAME = "data.json";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const blob = await head(BLOB_NAME);
      const r = await fetch(blob.url, { cache: "no-store" });
      const raw = await r.text();
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(raw);
    } catch {
      return res.status(200).json({ tables: {} });
    }
  }

  if (req.method === "POST") {
    try {
      const body =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      JSON.parse(body); // validate

      await put(BLOB_NAME, body, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });

      return res.json({ ok: true, savedAt: Date.now() });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  res.status(405).end();
}
