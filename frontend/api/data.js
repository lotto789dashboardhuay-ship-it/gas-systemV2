// api/data.js
import fs from "node:fs/promises";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "src/pages/Data.json");

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const raw = await fs.readFile(DATA_FILE, "utf-8");
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(raw);
    } catch {
      return res.status(200).json({ tables: {} });
    }
  }

  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      JSON.parse(body);
      await fs.writeFile(DATA_FILE, body, "utf-8");
      return res.json({ ok: true, savedAt: Date.now() });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  res.status(405).end();
}