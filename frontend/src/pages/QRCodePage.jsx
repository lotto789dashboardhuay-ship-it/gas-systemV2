import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่านจาก /api/data (Vite middleware → src/pages/Data.json)
//   - fallback → localStorage
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
    console.warn("loadLocalDb error:", e);
  }
  return null;
};

const fetchFileDb = async () => {
  const res = await fetch(API_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ====================================================
// Helpers
// ====================================================
const formatDate = (date) => date || "-";

// 1. ฟังก์ชันจัดการสีและข้อความของป้ายสถานะ
const getInspectionStatus = (status) => {
  const s = (status || "").toLowerCase().trim();

  // Admin ยืนยันจัดส่งแล้ว
  if (
    s === "success" ||
    s === "จัดส่งสำเร็จ" ||
    s === "จัดส่งแล้ว" ||
    s === "ใช้งานอยู่" ||
    s === "ลูกค้า"
  ) {
    return { text: "จัดส่งแล้ว", color: "#22c55e" };
  }

  // ระหว่างการจัดส่ง
  if (
    s === "delivering" ||
    s === "กำลังส่ง" ||
    s === "กำลังจัดส่ง" ||
    s === "pending_approval" ||
    s === "pending"
  ) {
    return { text: "กำลังส่ง", color: "#f97316" };
  }

  // ปกติ / ปลอดภัย / ในคลัง
  if (s === "ปลอดภัย" || s === "ปกติ" || s === "ในคลัง") {
    return { text: status || "ปกติ", color: "#22c55e" };
  }

  // ชำรุด / อื่น ๆ
  return { text: status || "ปกติ", color: "#ef4444" };
};

// ตรวจสอบว่าจัดส่งสำเร็จหรือยัง
const isDeliveredStatus = (status) => {
  const s = (status || "").toLowerCase().trim();
  return (
    s === "success" ||
    s === "จัดส่งสำเร็จ" ||
    s === "จัดส่งแล้ว" ||
    s === "ใช้งานอยู่" ||
    s === "ลูกค้า"
  );
};

// ====================================================
// Component
// ====================================================
function QRCodePage() {
  let params = {};
  try {
    params = useParams() || {};
  } catch (e) {
    params = {};
  }

  const pathId = window.location.pathname.split("/").pop();
  const id = params.id || pathId;

  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadedDbRef = useRef(null);

  // ---------- Load function ----------
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const fileDb = await fetchFileDb();
      if (!fileDb || !fileDb.tables) throw new Error("Data.json ไม่ถูกรูปแบบ");
      const norm = normalizeDb(fileDb);
      loadedDbRef.current = norm;
      setDb(norm);
      setApiAvailable(true);
    } catch (err) {
      console.warn("โหลดจาก /api/data ไม่ได้ -> ใช้ localStorage:", err);
      setApiAvailable(false);
      const local = loadLocalDb();
      if (local?.tables) setDb(normalizeDb(local));
      else setDb(emptyDb());
    } finally {
      setLastUpdated(new Date());
      if (!silent) setLoading(false);
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

  // ---------- หา cylinder จาก db ----------
  const cleanId = id ? decodeURIComponent(id).trim().replace(/\s+/g, "") : "";

  const cylinder = (() => {
    if (!db || !cleanId) return null;
    const list = db.tables.gas_cylinder || [];

    const normalize = (v) => String(v || "").trim().replace(/\s+/g, "");

    return (
      list.find((c) => normalize(c.serial_number) === cleanId) ||
      list.find((c) => normalize(c.cylinder_id) === cleanId) ||
      list.find((c) => normalize(c.qr_code) === cleanId) ||
      null
    );
  })();

  const error =
    !loading && (!cleanId || !cylinder)
      ? cleanId
        ? "ไม่พบข้อมูลถังแก๊สใบนี้ในระบบ"
        : "ไม่ได้ระบุรหัสถังแก๊ส"
      : null;

  // ---------- Loading ----------
  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h2
            style={{
              textAlign: "center",
              margin: 0,
              fontSize: "16px",
              color: "#9ca3af",
            }}
          >
            กำลังดึงข้อมูลถังแก๊ส...
          </h2>
        </div>
      </div>
    );
  }

  // ---------- Error ----------
  if (error || !cylinder) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "28px" }}>❌</span>
            <h1
              style={{
                margin: 0,
                fontSize: "20px",
                color: "#ef4444",
                fontWeight: "bold",
              }}
            >
              ไม่พบข้อมูลถังแก๊ส
            </h1>
          </div>
          <p
            style={{
              color: "#9ca3af",
              margin: "0 0 6px 0",
              textAlign: "center",
              fontSize: "14px",
            }}
          >
            Serial ที่ค้นหา: <strong>{cleanId || "-"}</strong>
          </p>
          <p
            style={{
              color: "#9ca3af",
              margin: 0,
              textAlign: "center",
              fontSize: "14px",
            }}
          >
            สาเหตุ: {error}
          </p>
          <div
            style={{
              marginTop: "16px",
              fontSize: "11px",
              color: apiAvailable ? "#22c55e" : "#f59e0b",
              textAlign: "center",
            }}
          >
            {apiAvailable
              ? "🟢 เชื่อมต่อ Data.json"
              : "🟠 โหมดออฟไลน์ (localStorage)"}
            {lastUpdated && (
              <span style={{ color: "#64748b", marginLeft: "6px" }}>
                • {lastUpdated.toLocaleTimeString("th-TH")}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Render ----------
  const inspectionStatus = getInspectionStatus(cylinder.status);
  const delivered = isDeliveredStatus(cylinder.status);
  const deliveredDateValue =
    cylinder.delivered_date || cylinder.deliveredDate || cylinder.updated_at;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Sync indicator */}
        <div
          style={{
            textAlign: "right",
            fontSize: "11px",
            color: apiAvailable ? "#22c55e" : "#f59e0b",
            marginBottom: "6px",
          }}
        >
          {apiAvailable ? "🟢 realtime" : "🟠 offline"}
          {lastUpdated && (
            <span style={{ color: "#64748b", marginLeft: "6px" }}>
              • {lastUpdated.toLocaleTimeString("th-TH")}
            </span>
          )}
        </div>

        {/* หัวข้อ + ป้ายสถานะ */}
        <div style={headerStyle}>
          <h1
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: "bold",
              color: "#e2e8f0",
            }}
          >
            ข้อมูลถังแก๊ส
          </h1>
          <span
            style={{
              ...statusBadgeStyle,
              backgroundColor: inspectionStatus.color,
            }}
          >
            {inspectionStatus.text}
          </span>
        </div>

        {/* รายการข้อมูล */}
        <div style={rowStyle}>
          <span style={labelStyle}>หมายเลข Serial</span>
          <span style={{ ...valueStyle, color: "#38bdf8" }}>
            {cylinder.serial_number || cylinder.serial || "-"}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Cylinder ID</span>
          <span style={{ ...valueStyle, color: "#f59e0b" }}>
            {cylinder.cylinder_id || "-"}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>ยี่ห้อ</span>
          <span style={valueStyle}>
            {cylinder.brand || cylinder.req_brand || "-"}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>ชนิดแก๊ส</span>
          <span style={valueStyle}>
            {cylinder.gas_type || cylinder.req_gas_type || "-"}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>ขนาดถัง</span>
          <span style={valueStyle}>
            {cylinder.size || cylinder.req_size || "-"}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>วันที่ผลิต</span>
          <span style={valueStyle}>
            {formatDate(cylinder.manufacture_date)}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>วันหมดอายุ</span>
          <span style={{ ...valueStyle, color: "#f87171" }}>
            {formatDate(cylinder.expiry_date)}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>วันตรวจล่าสุด</span>
          <span style={valueStyle}>
            {formatDate(cylinder.last_check_date)}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>วันตรวจครั้งถัดไป</span>
          <span style={valueStyle}>
            {formatDate(
              cylinder.next_check_date || cylinder.next_maintenance_date
            )}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>สถานที่ปัจจุบัน</span>
          <span style={valueStyle}>{cylinder.current_location || "-"}</span>
        </div>

        {/* กล่องสีเขียว แสดงเมื่อ Admin ยืนยันจัดส่งแล้ว */}
        {delivered && (
          <div style={stackedRowStyle}>
            <span
              style={{ ...labelStyle, color: "#4ade80", fontWeight: "bold" }}
            >
              วันที่ลูกค้าได้รับถังแก๊สสำเร็จ
            </span>
            <span
              style={{
                ...valueStyle,
                marginTop: "4px",
                color: "#4ade80",
              }}
            >
              {formatDate(deliveredDateValue)}
            </span>
          </div>
        )}

        {/* ปุ่มโทร */}
        <div style={{ marginTop: "28px" }}>
          <a href="tel:024643519" style={phoneButtonStyle}>
            📞 โทรติดต่อร้านค้า 02-464-3519
          </a>
        </div>
      </div>
    </div>
  );
}

// ====================================================
// Styles
// ====================================================
const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#0f172a",
  color: "#f3f4f6",
  padding: "16px",
  boxSizing: "border-box",
  fontFamily:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: "400px",
  background: "#1e293b",
  borderRadius: "20px",
  padding: "24px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
  boxSizing: "border-box",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "24px",
};

const statusBadgeStyle = {
  padding: "4px 14px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "14px",
  color: "white",
};

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  paddingBottom: "14px",
  marginBottom: "14px",
  borderBottom: "1px solid #334155",
};

const stackedRowStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  padding: "12px",
  marginBottom: "14px",
  backgroundColor: "#064e3b",
  borderRadius: "12px",
  border: "1px solid #059669",
};

const labelStyle = {
  fontSize: "15px",
  color: "#94a3b8",
  fontWeight: "500",
};

const valueStyle = {
  fontSize: "15px",
  color: "#f8fafc",
  fontWeight: "600",
};

const phoneButtonStyle = {
  backgroundColor: "#2563eb",
  color: "white",
  padding: "14px 20px",
  borderRadius: "14px",
  fontWeight: "bold",
  textDecoration: "none",
  display: "block",
  fontSize: "16px",
  border: "none",
  textAlign: "center",
  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)",
  transition: "all 0.2s ease-in-out",
};

export default QRCodePage;