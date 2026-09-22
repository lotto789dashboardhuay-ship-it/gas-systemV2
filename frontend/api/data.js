// api/data.js
export const config = { runtime: "nodejs" };

const KEY = "gas_system_data";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // อ่าน env var — Vercel inject ให้อัตโนมัติหลัง Connect Upstash
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(500).json({
      stage: "env",
      error: "Missing KV_REST_API_URL / KV_REST_API_TOKEN",
      hint: "Vercel → Settings → Env Variables → เช็ค 2 ตัวนี้ + Redeploy",
    });
  }

  // Import @upstash/redis
  let Redis;
  try {
    ({ Redis } = await import("@upstash/redis"));
  } catch (e) {
    return res.status(500).json({
      stage: "import",
      error: e.message,
      hint: "รัน npm install @upstash/redis แล้ว commit package.json + lock",
    });
  }

  const redis = new Redis({ url, token });

  // -------- GET --------
  if (req.method === "GET") {
    try {
      const data = await redis.get(KEY);
      return res.status(200).json(data || { tables: {} });
    } catch (e) {
      return res.status(500).json({ stage: "redis.get", error: e.message });
    }
  }

  // -------- POST --------
  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (!body || typeof body !== "object") {
        return res.status(400).json({ stage: "validate", error: "Invalid JSON" });
      }
      await redis.set(KEY, body);
      return res.status(200).json({ ok: true, savedAt: Date.now() });
    } catch (e) {
      return res.status(400).json({ stage: "redis.set", error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
