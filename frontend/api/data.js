// api/data.js
export const config = { runtime: "nodejs" };

const KEY = "gas_system_data";

// อ่าน env var หลายชื่อ (รองรับทั้ง Upstash ตรง และ KV เดิม)
function getRedisConfig() {
  return {
    url:
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      "",
    token:
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      "",
  };
}

export default async function handler(req, res) {
  try {
    const cfg = getRedisConfig();

    // 1) เช็ค env vars ก่อน
    if (!cfg.url || !cfg.token) {
      return res.status(500).json({
        stage: "env",
        error: "Missing Redis env vars",
        foundKeys: Object.keys(process.env).filter((k) =>
          /REDIS|KV_|UPSTASH/i.test(k)
        ),
      });
    }

    // 2) import แบบ dynamic เพื่อจับ error การโหลด module
    let Redis;
    try {
      ({ Redis } = await import("@upstash/redis"));
    } catch (e) {
      return res.status(500).json({
        stage: "import",
        error: "Cannot import @upstash/redis: " + e.message,
        hint: "npm install @upstash/redis แล้ว commit package.json + lock",
      });
    }

    const redis = new Redis({ url: cfg.url, token: cfg.token });

    // 3) GET
    if (req.method === "GET") {
      try {
        const data = await redis.get(KEY);
        return res.status(200).json(data || { tables: {} });
      } catch (e) {
        return res.status(500).json({
          stage: "redis.get",
          error: e.message,
        });
      }
    }

    // 4) POST
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
        return res.status(400).json({
          stage: "redis.set",
          error: e.message,
        });
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    // จับ error นอกสุด — จะได้ไม่ 500 เปล่า ๆ
    return res.status(500).json({
      stage: "top-level",
      error: e.message,
      stack: e.stack,
    });
  }
}
