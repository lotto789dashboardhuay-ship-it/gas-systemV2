import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import TopBar from "./TopBar";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่านจาก /api/data (Vite middleware -> src/pages/Data.json)
//   - fallback -> localStorage
//   - cache ไว้ใน memory ระดับ module 20 วินาที (Layout mount บ่อย)
// ====================================================
const DB_KEY = "gas_system_db_v1";
const API_URL = "/api/data";
const CACHE_TTL_MS = 20 * 1000;

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
    console.warn("Layout loadLocalDb error:", e);
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

// ---------- User info helper ----------
const getStoredUsername = () => {
  let storedUsername =
    localStorage.getItem("userName") ||
    localStorage.getItem("username") ||
    localStorage.getItem("name") ||
    "";

  if (!storedUsername) {
    try {
      const userObj = JSON.parse(localStorage.getItem("user") || "{}");
      storedUsername =
        userObj.name || userObj.username || userObj.userName || "";
    } catch (e) {
      storedUsername = "";
    }
  }
  return storedUsername;
};

// ---------- Derive stats from db ----------
const deriveTopbarStats = (db) => {
  const tables = db?.tables || {};
  const deliveries = tables.delivery || [];
  const cylinders = tables.gas_cylinder || [];

  const successCount = deliveries.filter(
    (d) => (d.status || "").toLowerCase() === "success"
  ).length;

  const pendingApproval = deliveries.filter(
    (d) => (d.status || "").toLowerCase() === "pending_approval"
  ).length;

  const delivering = deliveries.filter(
    (d) => (d.status || "").toLowerCase() === "delivering"
  ).length;

  const inStock = cylinders.filter(
    (c) => (c.status || "").trim() === "ในคลัง"
  ).length;

  // gasLevel: ไม่มีใน JSON จริง ใช้จำนวนถังในคลังเป็นตัวแทน (แสดงผลเป็นตัวเลข)
  // ถ้าอยากใช้ค่า sensor จริง ให้ override ผ่าน prop gasLevel ที่ parent ส่งมา
  const gasLevel = inStock;

  return {
    successCount,
    pendingApproval,
    delivering,
    inStock,
    gasLevel,
  };
};

// ====================================================
// Component
// ====================================================
function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [username, setUsername] = useState(getStoredUsername());

  const [stats, setStats] = useState({
    successCount: 0,
    pendingApproval: 0,
    delivering: 0,
    inStock: 0,
    gasLevel: 0,
  });
  const [apiAvailable, setApiAvailable] = useState(true);

  const mountedRef = useRef(true);

  // State สำหรับเปิด/ปิด Sidebar บนหน้าจอมือถือ
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ---------- อัปเดตข้อมูลผู้ใช้ทุกครั้งที่เปลี่ยนหน้า ----------
  useEffect(() => {
    setRole(localStorage.getItem("role") || "");
    setUsername(getStoredUsername());
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // ---------- Fetch stats จาก JSON ----------
  const loadStats = useCallback(async (silent = false) => {
    try {
      const { db, apiAvailable: ok } = await getCachedDb(silent);
      if (!mountedRef.current) return;
      setStats(deriveTopbarStats(db));
      setApiAvailable(ok);
    } catch (err) {
      if (!silent) console.warn("Layout: fetch stats failed:", err);
    }
  }, []);

  // Initial load + interval poll ทุก 5 วินาที
  useEffect(() => {
    mountedRef.current = true;
    loadStats();

    const interval = setInterval(() => loadStats(true), 5000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [loadStats]);

  // ---------- ฟัง storage event (sync ข้ามแท็บ) ----------
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === DB_KEY) loadStats(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadStats]);

  // ---------- Logout ----------
  const handleLogout = () => {
    localStorage.clear();
    // ล้าง cache ด้วย
    cachedDb = null;
    cachedAt = 0;
    navigate("/");
  };

  // ---------- Menu button style ----------
  const getMenuButtonStyle = (path) => ({
    ...menuButtonStyle,
    background: location.pathname === path ? "#334155" : "#1f2937",
  });

  // ---------- deliverySuccessItems: สร้าง mock array เพื่อ backward compat ----------
  const deliverySuccessItems = useMemo(() => {
    return new Array(stats.successCount).fill(1);
  }, [stats.successCount]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TopBar
        role={role}
        username={username}
        gasLevel={stats.gasLevel}
        deliverySuccessItems={deliverySuccessItems}
      />

      {/* แถบเปิดเมนูสำหรับอุปกรณ์มือถือ */}
      <div style={mobileHeaderBarContainerStyle}>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={mobileMenuToggleBtnStyle}
        >
          {isMobileMenuOpen ? "✕ ปิดเมนู" : "☰ เมนูหลัก"}
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "white",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          <span>GAS SYS ({role || "staff"})</span>
          <span
            style={{
              fontSize: "11px",
              color: apiAvailable ? "#22c55e" : "#f59e0b",
              fontWeight: "normal",
            }}
            title={
              apiAvailable ? "เชื่อมต่อ Data.json" : "โหมดออฟไลน์ (localStorage)"
            }
          >
            {apiAvailable ? "🟢" : "🟠"}
          </span>
        </div>
      </div>

      <div style={layoutBodyStyle}>
        {/* Sidebar Navigation */}
        <aside
          style={{
            ...asideStyle,
            display: isMobileMenuOpen ? "block" : undefined,
          }}
          className="responsive-sidebar"
        >
          <h2 style={{ marginTop: 0, fontSize: "24px" }}>GAS SYS</h2>
          <p style={{ opacity: 0.85, fontSize: "16px", marginBottom: "24px" }}>
            {role || "staff"} : {username || "ไม่ระบุชื่อ"}
          </p>

          <div style={{ marginTop: "10px" }}>
            {role === "admin" && (
              <>
                <button
                  type="button"
                  style={getMenuButtonStyle("/dashboard")}
                  onClick={() => navigate("/dashboard")}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  style={getMenuButtonStyle("/gas")}
                  onClick={() => navigate("/gas")}
                >
                  ถังแก๊ส
                </button>
                <button
                  type="button"
                  style={getMenuButtonStyle("/maintenance")}
                  onClick={() => navigate("/maintenance")}
                >
                  Maintenance
                </button>
                <button
                  type="button"
                  style={getMenuButtonStyle("/staff")}
                  onClick={() => navigate("/staff")}
                >
                  พนักงานส่ง
                </button>
                <button
                  type="button"
                  style={getMenuButtonStyle("/approval")}
                  onClick={() => navigate("/approval")}
                >
                  อนุมัติการจัดส่ง
                  {stats.pendingApproval > 0 && (
                    <span
                      style={{
                        marginLeft: "auto",
                        background: "#ef4444",
                        color: "white",
                        fontSize: "11px",
                        fontWeight: "bold",
                        borderRadius: "10px",
                        padding: "2px 8px",
                      }}
                    >
                      {stats.pendingApproval}
                    </span>
                  )}
                </button>
              </>
            )}
            <button
              type="button"
              style={getMenuButtonStyle("/delivery")}
              onClick={() => navigate("/delivery")}
            >
              Delivery
              {stats.delivering > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: "#f59e0b",
                    color: "white",
                    fontSize: "11px",
                    fontWeight: "bold",
                    borderRadius: "10px",
                    padding: "2px 8px",
                  }}
                >
                  {stats.delivering}
                </span>
              )}
            </button>
          </div>

          <button onClick={handleLogout} style={logoutButtonStyle}>
            Logout
          </button>
        </aside>

        {/* ส่วนแสดงผลเนื้อหาหลัก */}
        <main style={mainStyle}>{children}</main>
      </div>

      {/* Style แทรก responsive media query */}
      <style>{`
        @media (max-width: 768px) {
          .responsive-sidebar {
            display: ${isMobileMenuOpen ? "block" : "none"} !important;
            width: 100% !important;
            min-width: 100% !important;
            box-sizing: border-box !important;
          }
        }
        @media (min-width: 769px) {
          .responsive-sidebar {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}

// ====================================================
// Styles
// ====================================================
const layoutBodyStyle = {
  display: "flex",
  flex: 1,
  minHeight: "calc(100vh - 73px)",
  flexWrap: "wrap",
};

const mobileHeaderBarContainerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 16px",
  background: "#1e293b",
  borderBottom: "1px solid #334155",
};

const mobileMenuToggleBtnStyle = {
  background: "#3b82f6",
  color: "white",
  border: "none",
  padding: "8px 14px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "bold",
  cursor: "pointer",
};

const asideStyle = {
  width: "240px",
  background: "#0b1324",
  color: "white",
  padding: "20px",
  flexShrink: 0,
  boxSizing: "border-box",
};

const mainStyle = {
  flex: 1,
  padding: "16px",
  color: "white",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: "100vw",
  overflowX: "hidden",
};

const menuButtonStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  cursor: "pointer",
  marginBottom: "16px",
  padding: "14px 16px",
  borderRadius: "12px",
  background: "#1f2937",
  color: "white",
  border: "none",
  fontSize: "18px",
  fontWeight: "500",
  textAlign: "left",
};

const logoutButtonStyle = {
  marginTop: "30px",
  padding: "12px 14px",
  border: "none",
  borderRadius: "10px",
  background: "#ef4444",
  color: "white",
  cursor: "pointer",
  width: "100%",
  fontSize: "16px",
  fontWeight: "500",
};

export default Layout;