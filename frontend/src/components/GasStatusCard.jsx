import React, { useState, useEffect, useRef, useCallback } from "react";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่านจาก /api/data (Vite middleware -> src/pages/Data.json)
//   - fallback -> localStorage
//   - cache ระดับ module 10 วินาที (การ์ดนี้ render บ่อย)
// ====================================================
const DB_KEY = "gas_system_db_v1";
const API_URL = "/api/data";
const CACHE_TTL_MS = 10 * 1000;

const emptyDb = () => ({
  tables: {
    gas_cylinder: [],
    delivery: [],
    customer: [],
    delivery_staff: [],
  },
});

const normalizeDb = (d) => {
  const out = d && typeof d === "object" ? d : emptyDb();
  if (!out.tables) out.tables = {};
  if (!Array.isArray(out.tables.gas_cylinder)) out.tables.gas_cylinder = [];
  if (!Array.isArray(out.tables.delivery)) out.tables.delivery = [];
  if (!Array.isArray(out.tables.customer)) out.tables.customer = [];
  if (!Array.isArray(out.tables.delivery_staff)) out.tables.delivery_staff = [];
  return out;
};

const loadLocalDb = () => {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.tables) return parsed;
    }
  } catch (e) {
    console.warn("GasStatusCard loadLocalDb error:", e);
  }
  return null;
};

const fetchFileDb = async () => {
  const res = await fetch(API_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ---------- Module-level cache ----------
let cachedDb = null;
let cachedAt = 0;

const getCachedDb = async (force = false) => {
  const now = Date.now();
  if (!force && cachedDb && now - cachedAt < CACHE_TTL_MS) {
    return { db: cachedDb, apiAvailable: true };
  }
  try {
    const fileDb = await fetchFileDb();
    if (!fileDb || !fileDb.tables) throw new Error("Data.json ไม่ถูกรูปแบบ");
    const norm = normalizeDb(fileDb);
    cachedDb = norm;
    cachedAt = now;
    return { db: norm, apiAvailable: true };
  } catch (err) {
    const local = loadLocalDb();
    const norm = local?.tables ? normalizeDb(local) : emptyDb();
    cachedDb = norm;
    cachedAt = now;
    return { db: norm, apiAvailable: false };
  }
};

// ---------- Derive gas level จาก db ----------
// ลำดับความสำคัญ:
//   1) ถ้ามี db.meta.gasLevel (ผู้ใช้ใส่ค่าเองในไฟล์) -> ใช้
//   2) ถ้ามี db.tables.gas_status[0].level       -> ใช้
//   3) fallback: นับถัง "ในคลัง" ทั้งหมด
const deriveGasLevel = (db) => {
  const meta = db?.meta || {};
  if (typeof meta.gasLevel === "number") return meta.gasLevel;

  const gasStatus = db?.tables?.gas_status;
  if (Array.isArray(gasStatus) && gasStatus[0]) {
    const v = Number(gasStatus[0].level);
    if (!isNaN(v)) return v;
  }

  const cylinders = db?.tables?.gas_cylinder || [];
  return cylinders.filter((c) => (c.status || "").trim() === "ในคลัง").length;
};

// ====================================================
// Component
// ====================================================
function GasStatusCard() {
  const [gasLevel, setGasLevel] = useState(0);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const mountedRef = useRef(true);

  // ---------- Load function ----------
  const loadGasLevel = useCallback(async (silent = false) => {
    try {
      const { db, apiAvailable: ok } = await getCachedDb(false);
      if (!mountedRef.current) return;
      setGasLevel(deriveGasLevel(db));
      setApiAvailable(ok);
      setLastUpdated(new Date());
    } catch (err) {
      if (!silent) console.warn("GasStatusCard: fetch failed:", err);
    }
  }, []);

  // ---------- Mount + poll ทุก 3 วินาที ----------
  useEffect(() => {
    mountedRef.current = true;
    loadGasLevel();

    const interval = setInterval(() => loadGasLevel(true), 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [loadGasLevel]);

  // ---------- ฟัง storage event (sync ข้ามแท็บ) ----------
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === DB_KEY) loadGasLevel(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadGasLevel]);

  // ---------- Status helpers ----------
  const getStatusText = (level) => {
    if (level <= 520) return "ปกติ";
    if (level <= 720) return "เฝ้าระวัง";
    return "อันตราย";
  };

  const getStatusColor = (level) => {
    if (level <= 520) return "#22c55e";
    if (level <= 720) return "#facc15";
    return "#ef4444";
  };

  return (
    <div style={{ color: "white", marginBottom: "20px" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 12px",
          border: "1px solid #374151",
          borderRadius: "20px",
          backgroundColor: "#1f2937",
          marginBottom: "12px",
        }}
      >
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: getStatusColor(gasLevel),
          }}
        ></span>
        <span style={{ fontSize: "14px" }}>แก๊สในคลัง</span>
        <span
          style={{
            fontSize: "11px",
            color: apiAvailable ? "#22c55e" : "#f59e0b",
            marginLeft: "4px",
          }}
          title={
            apiAvailable ? "เชื่อมต่อ Data.json" : "โหมดออฟไลน์ (localStorage)"
          }
        >
          {apiAvailable ? "🟢" : "🟠"}
        </span>
      </div>

      <h3 style={{ fontSize: "20px", fontWeight: "bold", margin: "8px 0" }}>
        สถานะแก๊สในคลัง
      </h3>
      <p style={{ fontSize: "16px", margin: "4px 0" }}>
        ค่าปัจจุบัน: <strong>{gasLevel}</strong>
      </p>
      <p style={{ fontSize: "16px", margin: "4px 0" }}>
        สถานะ:{" "}
        <strong style={{ color: getStatusColor(gasLevel) }}>
          {getStatusText(gasLevel)}
        </strong>
      </p>

      {lastUpdated && (
        <p
          style={{
            fontSize: "11px",
            color: "#64748b",
            margin: "6px 0 0 0",
          }}
        >
          อัปเดตล่าสุด: {lastUpdated.toLocaleTimeString("th-TH")}
        </p>
      )}
    </div>
  );
}

export default GasStatusCard;