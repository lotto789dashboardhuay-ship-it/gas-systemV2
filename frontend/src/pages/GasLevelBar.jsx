import React, { useState, useEffect, useMemo, useCallback } from "react";
import Layout from "../components/Layout";

// ====================================================
// Persistence (เหมือนกับ GasPage ทุกประการ)
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
const isOver3Years = (dateString) => {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return false;
  return (new Date() - d) / (1000 * 60 * 60 * 24) > 365 * 3;
};

const groupCount = (arr, keyFn) => {
  const m = {};
  arr.forEach((item) => {
    const raw = keyFn(item);
    const k = raw == null ? "" : String(raw).trim();
    const key = k || "ไม่ระบุ";
    m[key] = (m[key] || 0) + 1;
  });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};

// ====================================================
// Component
// ====================================================
function GasDashboard() {
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ---------- Load (silent = ไม่ขึ้น loading) ----------
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const fileDb = await fetchFileDb();
      setDb(normalizeDb(fileDb));
      setApiAvailable(true);
    } catch (err) {
      const local = loadLocalDb();
      if (local?.tables) setDb(normalizeDb(local));
      else setDb(emptyDb());
      setApiAvailable(false);
    } finally {
      setLastUpdated(new Date());
      if (!silent) setLoading(false);
    }
  }, []);

  // ---------- Polling: ดึงข้อมูลทุก 5 วินาที (realtime-ish) ----------
  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ---------- ฟัง storage event (ให้ sync ข้ามแท็บ) ----------
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === DB_KEY) loadData(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadData]);

  // ---------- สถิติ ----------
  const stats = useMemo(() => {
    const cylinders = db?.tables?.gas_cylinder || [];
    const deliveries = db?.tables?.delivery || [];
    const customers = db?.tables?.customer || [];

    const total = cylinders.length;

    const inStock = cylinders.filter(
      (c) => (c.status || "").trim() === "ในคลัง"
    ).length;

    const damaged = cylinders.filter(
      (c) => (c.status || "").trim() === "ชำรุด"
    ).length;

    const pendingDeliveries = deliveries.filter(
      (d) => (d.status || "").toLowerCase() === "pending"
    ).length;

    const successDeliveries = deliveries.filter(
      (d) => (d.status || "").toLowerCase() === "success"
    ).length;

    const lost = deliveries.filter((d) =>
      isOver3Years(d.created_at || d.delivered_date)
    ).length;

    const byBrand = groupCount(cylinders, (c) => c.brand);
    const byGasType = groupCount(cylinders, (c) => c.gas_type);
    const bySize = groupCount(cylinders, (c) => c.size);
    const byLocation = groupCount(cylinders, (c) => c.current_location);

    return {
      total,
      inStock,
      damaged,
      pendingDeliveries,
      successDeliveries,
      lost,
      byBrand,
      byGasType,
      bySize,
      byLocation,
      deliveries,
      cylinders,
      customers,
    };
  }, [db]);

  // ---------- รายการจัดส่งล่าสุด 5 รายการ ----------
  const recentDeliveries = useMemo(() => {
    return [...stats.deliveries]
      .sort((a, b) => {
        const ta = new Date(a.created_at || a.delivered_date || 0).getTime();
        const tb = new Date(b.created_at || b.delivered_date || 0).getTime();
        return tb - ta;
      })
      .slice(0, 5)
      .map((d) => {
        const cust = stats.customers.find(
          (c) => c.customer_id === d.customer_id
        );
        return {
          ...d,
          customer_name: d.customer_name || cust?.name || "-",
        };
      });
  }, [stats]);

  // ---------- Overall status pill ----------
  const overallStatus = useMemo(() => {
    if (stats.lost > 0) return { text: "มีถังสูญหาย", color: "#ef4444" };
    if (stats.damaged > 0) return { text: "มีถังชำรุด", color: "#facc15" };
    if (stats.pendingDeliveries > 0)
      return { text: "กำลังจัดส่ง", color: "#3b82f6" };
    return { text: "ปกติ", color: "#22c55e" };
  }, [stats]);

  if (loading) {
    return (
      <Layout>
        <div
          style={{
            color: "white",
            padding: "40px",
            textAlign: "center",
            fontSize: "16px",
          }}
        >
          ⏳ กำลังโหลดข้อมูลจาก Data.json...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1 style={{ color: "white", margin: 0 }}>แดชบอร์ดภาพรวมระบบแก๊ส</h1>
          <div
            style={{
              fontSize: "12px",
              color: apiAvailable ? "#22c55e" : "#f59e0b",
              marginTop: "6px",
            }}
          >
            {apiAvailable
              ? "🟢 เชื่อมต่อ Data.json (realtime)"
              : "🟠 โหมดออฟไลน์ (localStorage)"}
            {lastUpdated && (
              <span style={{ color: "#94a3b8", marginLeft: "8px" }}>
                • อัปเดต: {lastUpdated.toLocaleTimeString("th-TH")}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadData()}
          style={refreshButtonStyle}
        >
          🔄 รีเฟรช
        </button>
      </div>

      {/* Overall status pill */}
      <div style={statusPillStyle}>
        <span
          style={{ ...dotStyle, backgroundColor: overallStatus.color }}
        />
        <span style={{ fontSize: "14px" }}>
          สถานะระบบ: <strong>{overallStatus.text}</strong>
        </span>
      </div>

      {/* Stat Cards */}
      <div style={statsGridStyle}>
        <StatCard
          icon="🛢️"
          label="ถังแก๊สทั้งหมด"
          value={stats.total}
          color="#38bdf8"
        />
        <StatCard
          icon="📦"
          label="ในคลัง"
          value={stats.inStock}
          color="#22c55e"
        />
        <StatCard
          icon="🚚"
          label="กำลังจัดส่ง"
          value={stats.pendingDeliveries}
          color="#f59e0b"
        />
        <StatCard
          icon="✅"
          label="จัดส่งสำเร็จ"
          value={stats.successDeliveries}
          color="#10b981"
        />
        <StatCard
          icon="⚠️"
          label="ชำรุด"
          value={stats.damaged}
          color="#f97316"
        />
        <StatCard
          icon="❌"
          label="สูญหาย (>3 ปี)"
          value={stats.lost}
          color="#ef4444"
        />
      </div>

      {/* Breakdown */}
      <div style={breakdownGridStyle}>
        <BreakdownCard
          title="แยกตามยี่ห้อ"
          data={stats.byBrand}
          total={stats.total}
          color="#3b82f6"
        />
        <BreakdownCard
          title="แยกตามชนิดแก๊ส"
          data={stats.byGasType}
          total={stats.total}
          color="#8b5cf6"
        />
        <BreakdownCard
          title="แยกตามขนาดถัง"
          data={stats.bySize}
          total={stats.total}
          color="#06b6d4"
        />
        <BreakdownCard
          title="แยกตามสถานที่"
          data={stats.byLocation}
          total={stats.total}
          color="#10b981"
        />
      </div>

      {/* Recent Deliveries */}
      <div style={{ marginTop: "30px", overflowX: "auto" }}>
        <h3
          style={{
            color: "#38bdf8",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          รายการจัดส่งล่าสุด
        </h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Delivery ID</th>
              <th style={thStyle}>Serial Number</th>
              <th style={thStyle}>ลูกค้า</th>
              <th style={thStyle}>สถานะ</th>
              <th style={thStyle}>วันที่</th>
            </tr>
          </thead>
          <tbody>
            {recentDeliveries.length > 0 ? (
              recentDeliveries.map((d) => {
                const raw = (d.status || "").toLowerCase();
                const isLost = isOver3Years(
                  d.created_at || d.delivered_date
                );
                let badge = { text: d.status || "-", color: "#6b7280" };
                if (isLost) badge = { text: "สูญหาย", color: "#ef4444" };
                else if (raw === "success")
                  badge = { text: "จัดส่งสำเร็จ", color: "#22c55e" };
                else if (raw === "pending")
                  badge = { text: "กำลังจัดส่ง", color: "#f59e0b" };

                return (
                  <tr
                    key={d.delivery_id}
                    style={
                      isLost
                        ? { backgroundColor: "rgba(239, 68, 68, 0.15)" }
                        : {}
                    }
                  >
                    <td
                      style={{
                        ...tdStyle,
                        color: "#f59e0b",
                        fontWeight: "bold",
                      }}
                    >
                      #{d.delivery_id || "-"}
                    </td>
                    <td style={{ ...tdStyle, color: "#38bdf8" }}>
                      {d.serial_number || (
                        <span
                          style={{
                            color: "#f59e0b",
                            fontSize: "12px",
                            fontStyle: "italic",
                          }}
                        >
                          รอสแกนถัง
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: "#4ade80" }}>
                      {d.customer_name}
                    </td>
                    <td style={tdStyle}>
                      <span style={badgeStyle(badge.color)}>
                        {badge.text}
                      </span>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontSize: "12px",
                        color: "#94a3b8",
                      }}
                    >
                      {d.created_at || d.delivered_date || "-"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    ...tdStyle,
                    textAlign: "center",
                    color: "#9ca3af",
                    padding: "20px",
                  }}
                >
                  ยังไม่มีรายการจัดส่ง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

// ====================================================
// Sub-components
// ====================================================
function StatCard({ icon, label, value, color }) {
  return (
    <div
      style={{
        background: "#1f2937",
        border: "1px solid #374151",
        borderLeft: `4px solid ${color}`,
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: "12px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "6px" }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: "bold",
          color: color,
          lineHeight: 1.1,
        }}
      >
        {value.toLocaleString("th-TH")}
      </div>
    </div>
  );
}

function BreakdownCard({ title, data, total, color }) {
  const max = data.length ? Math.max(...data.map(([, v]) => v)) : 1;

  return (
    <div
      style={{
        background: "#1f2937",
        border: "1px solid #374151",
        borderRadius: "12px",
        padding: "16px",
      }}
    >
      <h4
        style={{
          margin: "0 0 12px 0",
          color: "#e5e7eb",
          fontSize: "14px",
          fontWeight: "600",
        }}
      >
        {title}
      </h4>
      {data.length === 0 ? (
        <div
          style={{
            color: "#6b7280",
            fontSize: "12px",
            textAlign: "center",
            padding: "10px 0",
          }}
        >
          ยังไม่มีข้อมูล
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {data.slice(0, 6).map(([key, value]) => {
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            const barPct = max > 0 ? (value / max) * 100 : 0;
            return (
              <div key={key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: "#cbd5e1",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "70%",
                    }}
                  >
                    {key}
                  </span>
                  <span style={{ color: "#94a3b8" }}>
                    {value} ({pct}%)
                  </span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "#111827",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${barPct}%`,
                      height: "100%",
                      background: color,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ====================================================
// Styles
// ====================================================
const statusPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 14px",
  border: "1px solid #374151",
  borderRadius: "20px",
  marginBottom: "16px",
  background: "#1f2937",
  color: "white",
};
const dotStyle = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  display: "inline-block",
};
const refreshButtonStyle = {
  padding: "8px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};
const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
  marginBottom: "24px",
};
const breakdownGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "12px",
};
const badgeStyle = (bgColor) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "12px",
  backgroundColor: bgColor,
  color: "white",
  fontSize: "11px",
  fontWeight: "bold",
});
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#1f2937",
  color: "white",
  borderRadius: "12px",
  fontSize: "13px",
  whiteSpace: "nowrap",
};
const thStyle = {
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid #374151",
  backgroundColor: "#2d3a4a",
  fontWeight: "600",
  color: "#e5e7eb",
};
const tdStyle = {
  padding: "8px 12px",
  borderBottom: "1px solid #374151",
  verticalAlign: "middle",
};

export default GasDashboard;