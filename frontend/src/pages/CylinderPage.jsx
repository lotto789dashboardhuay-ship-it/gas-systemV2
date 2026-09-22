import { useParams } from "react-router-dom";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่านจาก /api/data (Vite middleware → src/pages/Data.json)
//   - fallback → localStorage
// ====================================================
const DB_KEY = "gas_system_db_v1";
const OPT_KEY = "gas_system_options_v1";
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
const formatDate = (date) => {
  if (!date) return "-";
  return date;
};

// คำนวณวันหมดอายุถัง/แก๊สอัตโนมัติ (นับไป 5 ปีจากวันที่ผลิต) — ใช้เป็น fallback
const calculateExpiryDate = (manufactureDate) => {
  if (!manufactureDate) return "-";
  const date = new Date(manufactureDate);
  if (isNaN(date.getTime())) return "-";
  date.setFullYear(date.getFullYear() + 5);
  return date.toISOString().split("T")[0];
};

// ตรวจสอบสถานะความปลอดภัย
const getInspectionStatus = (statusFromDb) => {
  if (
    statusFromDb === "ปลอดภัย" ||
    statusFromDb === "ปกติ" ||
    statusFromDb === "ในคลัง" ||
    !statusFromDb
  ) {
    return { text: statusFromDb || "ปกติ", color: "#22c55e" };
  }
  if (statusFromDb === "success" || statusFromDb === "จัดส่งสำเร็จ") {
    return { text: statusFromDb, color: "#22c55e" };
  }
  if (statusFromDb === "pending" || statusFromDb === "กำลังจัดส่ง") {
    return { text: statusFromDb, color: "#f59e0b" };
  }
  return { text: statusFromDb, color: "#ef4444" };
};

// รูปภาพอาจเป็น base64 (data URL) หรือ path เดิมของ Backend ก็รองรับ
const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  if (imagePath.startsWith("data:")) return imagePath;

  const cleanPath = imagePath.startsWith("/") ? imagePath.slice(1) : imagePath;

  if (cleanPath.startsWith("Backend/")) {
    return `/${cleanPath}`;
  }

  return `/Backend/uploads/${cleanPath}`;
};

// ====================================================
// Component
// ====================================================
function CylinderPage() {
  const { id } = useParams();
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // เก็บ ref ไว้เทียบว่าเปลี่ยนข้อมูลจริงหรือไม่ (ไม่ใช้ auto-save ในหน้านี้ — read-only)
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
  const cylinder = useMemo(() => {
    if (!db || !id) return null;
    const target = decodeURIComponent(String(id)).trim();
    const list = db.tables.gas_cylinder || [];

    // match หลายแบบ: serial_number ก่อน → cylinder_id → qr_code
    return (
      list.find((c) => String(c.serial_number || "").trim() === target) ||
      list.find((c) => String(c.cylinder_id || "").trim() === target) ||
      list.find((c) => String(c.qr_code || "").trim() === target) ||
      null
    );
  }, [db, id]);

  const error = !loading && !cylinder ? "ไม่พบข้อมูลถังแก๊สใน Data.json" : null;

  // ---------- Loading ----------
  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h2
            style={{
              textAlign: "center",
              margin: 0,
              fontSize: "18px",
              color: "#9ca3af",
            }}
          >
            กำลังโหลดข้อมูลถังแก๊ส...
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
            <span style={{ fontSize: "28px", color: "#ef4444" }}>❌</span>
            <h1
              style={{
                margin: 0,
                fontSize: "24px",
                color: "#ef4444",
                fontWeight: "bold",
              }}
            >
              ไม่พบข้อมูลถังแก๊ส
            </h1>
          </div>
          <p style={{ margin: "0 0 8px 0", textAlign: "center" }}>
            หมายเลข Serial ที่ค้นหา: <strong>{id}</strong>
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
              fontSize: "12px",
              color: apiAvailable ? "#22c55e" : "#f59e0b",
              textAlign: "center",
            }}
          >
            {apiAvailable
              ? "🟢 เชื่อมต่อ Data.json"
              : "🟠 โหมดออฟไลน์ (localStorage)"}
            {lastUpdated && (
              <span style={{ color: "#94a3b8", marginLeft: "8px" }}>
                • อัปเดต: {lastUpdated.toLocaleTimeString("th-TH")}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Render ----------
  const inspectionStatus = getInspectionStatus(cylinder.status);
  const expiryDate =
    cylinder.expiry_date || calculateExpiryDate(cylinder.manufacture_date);
  const cylinderImage =
    cylinder.image || cylinder.proof_image || cylinder.cylinder_image;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Sync status */}
        <div
          style={{
            textAlign: "right",
            fontSize: "11px",
            color: apiAvailable ? "#22c55e" : "#f59e0b",
            marginBottom: "8px",
          }}
        >
          {apiAvailable ? "🟢 realtime" : "🟠 offline"}
          {lastUpdated && (
            <span style={{ color: "#64748b", marginLeft: "6px" }}>
              • {lastUpdated.toLocaleTimeString("th-TH")}
            </span>
          )}
        </div>

        {/* Header */}
        <div style={headerStyle}>
          <h1 style={titleStyle}>
            ข้อมูลถังแก๊ส <span style={{ marginLeft: "4px" }}>🛢️</span>
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

        {/* รูปภาพ */}
        {cylinderImage && (
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <img
              src={getImageUrl(cylinderImage)}
              alt="รูปภาพถังแก๊ส"
              style={{
                width: "100%",
                maxHeight: "240px",
                borderRadius: "12px",
                objectFit: "contain",
                backgroundColor: "#0f172a",
                border: "1px solid #2d3748",
                padding: "8px",
                boxSizing: "border-box",
              }}
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
        )}

        {/* Data rows */}
        <div style={rowStyle}>
          <strong style={labelStyle}>หมายเลข Serial</strong>
          <span
            style={{ ...valueStyle, fontWeight: "bold", color: "#38bdf8" }}
          >
            {cylinder.serial_number || id}
          </span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>Cylinder ID</strong>
          <span style={{ ...valueStyle, color: "#f59e0b", fontWeight: "bold" }}>
            {cylinder.cylinder_id || "-"}
          </span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>ยี่ห้อ</strong>
          <span style={valueStyle}>{cylinder.brand || "-"}</span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>ชนิดแก๊ส</strong>
          <span style={valueStyle}>{cylinder.gas_type || "-"}</span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>ขนาดถัง</strong>
          <span style={valueStyle}>{cylinder.size || "-"}</span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>วันที่ผลิต</strong>
          <span style={valueStyle}>{formatDate(cylinder.manufacture_date)}</span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>วันหมดอายุแก๊ส</strong>
          <span
            style={{ ...valueStyle, color: "#f87171", fontWeight: "bold" }}
          >
            {formatDate(expiryDate)}
          </span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>วันตรวจล่าสุด</strong>
          <span style={valueStyle}>
            {formatDate(cylinder.last_check_date)}
          </span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>วันตรวจครั้งถัดไป</strong>
          <span style={valueStyle}>
            {formatDate(
              cylinder.next_check_date || cylinder.next_maintenance_date
            )}
          </span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>วันที่ลูกค้าได้รับถังแก๊สสำเร็จ</strong>
          <span style={valueStyle}>{formatDate(cylinder.delivered_date)}</span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>สถานที่ปัจจุบัน</strong>
          <span style={valueStyle}>{cylinder.current_location || "-"}</span>
        </div>

        <div style={rowStyle}>
          <strong style={labelStyle}>สถานะ</strong>
          <span
            style={{
              ...valueStyle,
              color: inspectionStatus.color,
              fontWeight: "bold",
            }}
          >
            {cylinder.status || "-"}
          </span>
        </div>

        {/* ปุ่มโทร */}
        <div
          style={{
            ...rowStyle,
            borderBottom: "none",
            paddingBottom: 0,
            marginTop: "24px",
            alignItems: "center",
          }}
        >
          <strong style={labelStyle}>เบอร์โทรบริการ</strong>
          <a href="tel:024643519" style={phoneButtonStyle}>
            โทร 02-464-3519
          </a>
        </div>
      </div>
    </div>
  );
}

// --- Styles ---
const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#0f172a",
  color: "white",
  padding: "20px",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: "520px",
  background: "#1e2530",
  borderRadius: "16px",
  padding: "32px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  boxSizing: "border-box",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "28px",
};

const titleStyle = {
  margin: 0,
  fontSize: "26px",
  fontWeight: "bold",
};

const statusBadgeStyle = {
  padding: "5px 14px",
  borderRadius: "999px",
  fontWeight: "600",
  fontSize: "12px",
  color: "white",
};

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  paddingBottom: "12px",
  marginBottom: "12px",
  borderBottom: "1px solid #2d3748",
};

const labelStyle = {
  fontSize: "14px",
  color: "#9ca3af",
  fontWeight: "500",
};

const valueStyle = {
  fontSize: "14px",
  color: "#e5e7eb",
  fontWeight: "500",
};

const phoneButtonStyle = {
  backgroundColor: "#1d4ed8",
  color: "white",
  padding: "6px 16px",
  borderRadius: "999px",
  fontWeight: "600",
  textDecoration: "none",
  display: "inline-block",
  fontSize: "13px",
  border: "none",
};

export default CylinderPage;