// api/data.js
// ====================================================
// Vercel Serverless Function
// ใช้ Vercel Blob REST API ผ่าน native fetch (ไม่ต้องติดตั้ง npm)
// ====================================================

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_STORE_ID =
  process.env.BLOB_STORE_ID || "store_m4VrIT5HpJQaWumO";
const BLOB_PATHNAME = "gas-system/Data.json";
const BLOB_API = "https://blob.vercel-storage.com";
const API_VERSION = "7";

// ---------- Utils ----------
function jsonResponse(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

// ---------- List blobs เพื่อหาลิงก์ของ Data.json ----------
async function listTargetBlob() {
  const url =
    `${BLOB_API}?prefix=${encodeURIComponent(BLOB_PATHNAME)}&limit=100`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${BLOB_TOKEN}`,
      "x-api-version": API_VERSION,
    },
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Blob list failed (${r.status}): ${t}`);
  }

  const data = await r.json();
  const blobs = Array.isArray(data.blobs) ? data.blobs : [];
  return blobs.find((b) => b.pathname === BLOB_PATHNAME) || null;
}

// ---------- อ่านเนื้อหา blob ----------
async function readBlobText(blob) {
  const target = blob.downloadUrl || blob.url;

  // ลอง fetch แบบมี auth ก่อน (รองรับ private store)
  let r = await fetch(target, {
    headers: { Authorization: `Bearer ${BLOB_TOKEN}` },
    cache: "no-store",
  });

  // ถ้าไม่ผ่าน ลองแบบไม่มี auth (เผื่อ public)
  if (!r.ok) {
    r = await fetch(target, { cache: "no-store" });
  }

  if (!r.ok) throw new Error(`Blob download failed (${r.status})`);
  return await r.text();
}

// ---------- อัปโหลด content ทับ pathname เดิม ----------
async function uploadBlob(content) {
  const url = `${BLOB_API}/${BLOB_PATHNAME}`;

  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${BLOB_TOKEN}`,
      "x-api-version": API_VERSION,
      "x-content-type": "application/json; charset=utf-8",
      // 0 = ไม่ใส่ random suffix → pathname คงที่ ทับไฟล์เดิมทุกครั้ง
      "x-add-random-suffix": "0",
      "x-vercel-blob-store-id": BLOB_STORE_ID,
    },
    body: content,
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Blob upload failed (${r.status}): ${t}`);
  }

  return r.json();
}

// ---------- อ่าน body แบบ raw (รองรับทั้ง JSON body และ sendBeacon) ----------
async function readRequestBody(req) {
  // Vercel parse body ให้แล้วถ้า Content-Type = application/json
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString("utf-8");
    return JSON.stringify(req.body);
  }

  // Fallback: อ่าน stream เอง (สำหรับ sendBeacon)
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on("data", (c) => chunks.push(c));
    req.on("end", resolve);
    req.on("error", reject);
  });
  return Buffer.concat(chunks).toString("utf-8");
}

// ====================================================
// Handler
// ====================================================
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (!BLOB_TOKEN) {
    return jsonResponse(res, 500, {
      error: "Missing BLOB_READ_WRITE_TOKEN env variable",
    });
  }

  // ---------------- GET ----------------
  if (req.method === "GET") {
    try {
      const blob = await listTargetBlob();

      if (!blob) {
        // ยังไม่มีไฟล์บน Blob → คืนค่าเริ่มต้น
        return jsonResponse(res, 200, { tables: {} });
      }

      const text = await readBlobText(blob);

      // Validate ว่าเป็น JSON จริง
      try {
        JSON.parse(text);
      } catch {
        return jsonResponse(res, 200, { tables: {} });
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(text);
      return;
    } catch (err) {
      console.error("[GET /api/data]", err);
      return jsonResponse(res, 500, { error: err.message || "Unknown error" });
    }
  }

  // ---------------- POST ----------------
  if (req.method === "POST") {
    try {
      const raw = (await readRequestBody(req)) || "";
      if (!raw.trim()) {
        return jsonResponse(res, 400, { error: "Empty body" });
      }

      // Validate JSON ก่อนเขียน
      JSON.parse(raw);

      await uploadBlob(raw);

      return jsonResponse(res, 200, { ok: true, savedAt: Date.now() });
    } catch (err) {
      console.error("[POST /api/data]", err);
      return jsonResponse(res, 400, { error: err.message || "Unknown error" });
    }
  }

  return jsonResponse(res, 405, { error: "Method Not Allowed" });
}
