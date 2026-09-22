// api/data.js
import fs from "node:fs/promises";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "src/pages/Data.json");
const KV_KEY = "gas_system_data";
const USE_KV = Boolean(process.env.KV_REST_API_URL);

// โหลด kv แบบ dynamic (เพื่อไม่ให้ dev พังถ้าไม่ได้ติดตั้ง)
let kv = null;
if (USE_KV) {
  ({ kv } = await import("@vercel/kv"));
}

async function readData() {
  if (USE_KV) {
    const cached = await kv.get(KV_KEY);
    if (cached) return cached;
    // seed ครั้งแรกจากไฟล์
    const seed = JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
    await kv.set(KV_KEY, seed);
    return seed;
  }
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
  } catch {
    return { tables: {} };
  }
}

async function writeData(data) {
  if (USE_KV) {
    await kv.set(KV_KEY, data);
  } else {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  }
}

export default async function handler(req, res) {
  try {
    // ---------- GET ----------
    if (req.method === "GET") {
      const data = await readData();
      return res.status(200).json(data);
    }

    // ---------- POST (แทนที่ทั้งก้อน) ----------
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
      await writeData(body);
      return res.json({ ok: true, savedAt: Date.now() });
    }

    // ---------- PATCH (อัปเดตบางตาราง) ----------
    // body: { table: "gas_cylinder", rows: [...] }
    // หรือ   { tables: { gas_cylinder: [...] } } เพื่อ merge
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const data = await readData();
      data.tables = data.tables || {};

      if (body.table && Array.isArray(body.rows)) {
        data.tables[body.table] = body.rows;
      } else if (body.tables && typeof body.tables === "object") {
        data.tables = { ...data.tables, ...body.tables };
      } else {
        return res.status(400).json({ error: "Need {table, rows} or {tables}" });
      }

      await writeData(data);
      return res.json({ ok: true, savedAt: Date.now() });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("[api/data]", e);
    return res.status(500).json({ error: e.message });
  }
}
