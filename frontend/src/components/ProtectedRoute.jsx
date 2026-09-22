import { useEffect, useState, useRef } from "react";
import { Navigate } from "react-router-dom";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่านจาก /api/data (Vite middleware -> src/pages/Data.json)
//   - fallback -> localStorage
//   - cache ไว้ใน memory ระดับ module เพื่อไม่ให้ยิงซ้ำทุกครั้งที่เปลี่ยนหน้า
// ====================================================
const DB_KEY = "gas_system_db_v1";
const API_URL = "/api/data";
const CACHE_TTL_MS = 30 * 1000; // 30 วินาที

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
    console.warn("ProtectedRoute loadLocalDb error:", e);
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

const getDb = async (force = false) => {
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
    // fallback localStorage
    const local = loadLocalDb();
    const norm = local?.tables ? normalizeDb(local) : emptyDb();
    cachedDb = norm;
    cachedAt = now;
    return { db: norm, apiAvailable: false };
  }
};

// ====================================================
// Validation
// ====================================================
const ADMIN_ROLES = ["admin", "ผู้ดูแลระบบ"];
const STAFF_ROLES = ["staff", "พนักงาน", "พนักงานส่ง"];

const isAdminRole = (role) =>
  ADMIN_ROLES.includes(String(role || "").toLowerCase().trim());

const isStaffRole = (role) =>
  STAFF_ROLES.includes(String(role || "").toLowerCase().trim());

// ตรวจสอบผู้ใช้กับ db:
// - admin  -> ไม่ต้อง match ใน delivery_staff (สมมติ admin hardcoded / external)
// - staff  -> ต้องมี username ใน delivery_staff และ status = "active"
// - ถ้า db ว่างเปล่า -> ปล่อยผ่าน (ไม่บล็อก) เพราะยังไม่มีข้อมูล seed
const validateUserWithDb = (db, role, username) => {
  const tables = db?.tables || {};
  const staffs = tables.delivery_staff || [];

  // ถ้าไม่มีข้อมูลพนักงานเลย -> ปล่อยผ่าน
  if (staffs.length === 0) return { ok: true, reason: "no-staff-data" };

  // admin ผ่านได้เลย
  if (isAdminRole(role)) return { ok: true, reason: "admin" };

  // staff ต้องเจอในตาราง
  if (isStaffRole(role)) {
    const target = String(username || "").trim().toLowerCase();
    if (!target) return { ok: false, reason: "no-username" };

    const found = staffs.find(
      (s) => String(s.username || "").trim().toLowerCase() === target
    );

    if (!found) return { ok: false, reason: "not-found" };
    if ((found.status || "active").toLowerCase() !== "active") {
      return { ok: false, reason: "inactive" };
    }
    return { ok: true, reason: "staff-active" };
  }

  // role อื่น ๆ ที่ไม่รู้จัก -> ปล่อยผ่าน ให้ route ของ parent จัดการ
  return { ok: true, reason: "unknown-role" };
};

// ====================================================
// Component
// ====================================================
function ProtectedRoute({ children, allowedRoles }) {
  const [status, setStatus] = useState("checking"); // checking | ok | redirect-login | redirect-dashboard

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const run = async () => {
      const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
      const role = localStorage.getItem("role");
      const username =
        localStorage.getItem("username") ||
        localStorage.getItem("userName") ||
        localStorage.getItem("name") ||
        "";

      // 1) gate พื้นฐานจาก localStorage
      if (!isLoggedIn) {
        if (mountedRef.current) setStatus("redirect-login");
        return;
      }

      // 2) role allowed หรือไม่ (ถ้าส่ง allowedRoles มา)
      if (allowedRoles && !allowedRoles.includes(role)) {
        if (mountedRef.current) setStatus("redirect-dashboard");
        return;
      }

      // 3) ตรวจสอบกับ db (JSON)
      const { db } = await getDb();
      const result = validateUserWithDb(db, role, username);

      if (!mountedRef.current) return;

      if (!result.ok) {
        // ผู้ใช้ไม่มีในระบบ / ถูกปิดการใช้งาน -> force logout + กลับหน้า login
        console.warn("ProtectedRoute: บล็อกการเข้าถึง -", result.reason);
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("role");
        localStorage.removeItem("username");
        localStorage.removeItem("userName");
        localStorage.removeItem("name");
        localStorage.removeItem("staff_id");
        localStorage.removeItem("token");
        setStatus("redirect-login");
        return;
      }

      setStatus("ok");
    };

    run();

    return () => {
      mountedRef.current = false;
    };
  }, [allowedRoles]);

  // ---------- Render ----------
  if (status === "checking") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#9ca3af",
          fontSize: "14px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        ⏳ กำลังตรวจสอบสิทธิ์การเข้าถึง...
      </div>
    );
  }

  if (status === "redirect-login") {
    return <Navigate to="/" replace />;
  }

  if (status === "redirect-dashboard") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default ProtectedRoute;