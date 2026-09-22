import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่านจาก /api/data (Vite middleware -> src/pages/Data.json)
//   - fallback -> localStorage
// ====================================================
const DB_KEY = "gas_system_db_v1";
const API_URL = "/api/data";

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
    console.warn("TopBar loadLocalDb error:", e);
  }
  return null;
};

const fetchFileDb = async () => {
  const res = await fetch(API_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ====================================================
// Component
// ====================================================
function TopBar({
  role: propsRole,
  username: propsUsername,
  gasLevel = 0,
  deliverySuccessItems = [],
}) {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(true);
  const [db, setDb] = useState(null);
  const [apiAvailable, setApiAvailable] = useState(true);

  const loadedDbRef = useRef(null);

  // ---------- Load function ----------
  const loadData = useCallback(async (silent = false) => {
    try {
      const fileDb = await fetchFileDb();
      if (!fileDb || !fileDb.tables) throw new Error("Data.json ไม่ถูกรูปแบบ");
      const norm = normalizeDb(fileDb);
      loadedDbRef.current = norm;
      setDb(norm);
      setApiAvailable(true);
    } catch (err) {
      if (!silent) console.warn("TopBar: ใช้ localStorage แทน /api/data");
      setApiAvailable(false);
      const local = loadLocalDb();
      if (local?.tables) setDb(normalizeDb(local));
      else setDb(emptyDb());
    }
  }, []);

  // ---------- Load on mount + poll ทุก 5 วินาที ----------
  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ---------- ฟัง storage event (sync ข้ามแท็บ) ----------
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === DB_KEY) loadData(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadData]);

  // ---------- User info ----------
  const localRole = (
    localStorage.getItem("role") ||
    propsRole ||
    ""
  ).toLowerCase();
  const localUsername =
    localStorage.getItem("username") || propsUsername || "ไม่ระบุชื่อ";
  const isAdmin = localRole === "admin" || localRole === "ผู้ดูแลระบบ";

  // ---------- Derive counts จาก db ----------
  const { pendingApprovalCount, deliveringCount, inStockCount } = useMemo(() => {
    const tables = db?.tables || {};
    const deliveries = tables.delivery || [];
    const cylinders = tables.gas_cylinder || [];

    const pendingApproval = deliveries.filter(
      (d) => (d.status || "").toLowerCase() === "pending_approval"
    ).length;

    const delivering = deliveries.filter(
      (d) => (d.status || "").toLowerCase() === "delivering"
    ).length;

    const inStock = cylinders.filter(
      (c) => (c.status || "").trim() === "ในคลัง"
    ).length;

    return {
      pendingApprovalCount: pendingApproval,
      deliveringCount: delivering,
      inStockCount: inStock,
    };
  }, [db]);

  // ---------- Props fallback (backward compatibility) ----------
  // ถ้า caller ส่ง deliverySuccessItems มา (จาก layout) จะใช้ค่านั้น ไม่ใช้ค่าจาก db
  const propsSuccessCount = Array.isArray(deliverySuccessItems)
    ? deliverySuccessItems.length
    : Number(deliverySuccessItems) || 0;

  // ---------- Gas level helpers ----------
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
    <div
      style={{
        background: "#0b1329",
        padding: "16px 24px",
        color: "white",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* ---------- Gas level pill ---------- */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            border: "1px solid #374151",
            borderRadius: "20px",
            background: "#1f2937",
            color: "white",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: getStatusColor(gasLevel),
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "14px", color: "#d1d5db" }}>แก๊สในคลัง</span>
          {showDetails && (
            <strong
              style={{
                fontSize: "14px",
                color: getStatusColor(gasLevel),
                marginLeft: "4px",
              }}
            >
              {gasLevel} ({getStatusText(gasLevel)})
            </strong>
          )}
        </button>

        {/* ---------- Right side: admin or staff ---------- */}
        {isAdmin ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "14px",
              flexWrap: "wrap",
            }}
          >
            {/* จำนวนถังในคลัง (จาก db) */}
            <button
              onClick={() => navigate("/gas")}
              title="จำนวนถังในคลัง"
              style={{
                background: "#1f2937",
                border: "1px solid #374151",
                padding: "6px 14px",
                borderRadius: "8px",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>🛢️ ในคลัง</span>
              <strong style={{ color: "#38bdf8", fontSize: "15px" }}>
                {inStockCount}
              </strong>
            </button>

            {/* จำนวนงานที่กำลังจัดส่ง */}
            {deliveringCount > 0 && (
              <button
                onClick={() => navigate("/delivery")}
                title="งานที่กำลังจัดส่ง"
                style={{
                  background: "#1f2937",
                  border: "1px solid #374151",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  color: "white",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>🚚 กำลังส่ง</span>
                <strong style={{ color: "#f59e0b", fontSize: "15px" }}>
                  {deliveringCount}
                </strong>
              </button>
            )}

            {/* จำนวนงานรออนุมัติ */}
            <button
              onClick={() => navigate("/approval")}
              style={{
                background: "#1f2937",
                border: "1px solid #374151",
                padding: "6px 14px",
                borderRadius: "8px",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>รออนุมัติส่ง</span>
              <strong
                style={{
                  color: pendingApprovalCount > 0 ? "#facc15" : "#22c55e",
                  fontSize: "15px",
                }}
              >
                {pendingApprovalCount}
              </strong>
            </button>

            <span style={{ color: "#9ca3af", marginLeft: "8px" }}>
              ผู้ใช้: <strong style={{ color: "white" }}>{localUsername}</strong>
            </span>

            {/* Sync indicator */}
            <span
              style={{
                fontSize: "11px",
                color: apiAvailable ? "#22c55e" : "#f59e0b",
              }}
              title={apiAvailable ? "เชื่อมต่อ Data.json" : "โหมดออฟไลน์"}
            >
              {apiAvailable ? "🟢" : "🟠"}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            {/* แสดงจำนวนงานที่พนักงานคนนี้กำลังส่ง */}
            {deliveringCount > 0 && (
              <span
                style={{
                  background: "rgba(245, 158, 11, 0.2)",
                  border: "1px solid #f59e0b",
                  color: "#fbbf24",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  fontSize: "13px",
                }}
              >
                🚚 กำลังส่ง {deliveringCount} งาน
              </span>
            )}

            <span style={{ color: "#9ca3af", fontSize: "14px" }}>
              พนักงาน: <strong style={{ color: "white" }}>{localUsername}</strong>
            </span>

            <span
              style={{
                fontSize: "11px",
                color: apiAvailable ? "#22c55e" : "#f59e0b",
              }}
              title={apiAvailable ? "เชื่อมต่อ Data.json" : "โหมดออฟไลน์"}
            >
              {apiAvailable ? "🟢" : "🟠"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TopBar;