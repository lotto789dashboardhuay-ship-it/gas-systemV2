import { useMemo } from "react";
import Layout from "../components/Layout";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

// ------------------------------------------------------------
// Mock DB (จากไฟล์ Data.json ที่ export มา)
// ------------------------------------------------------------
import mockDb from "../pages/Data.json";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const TODAY = new Date();

// ดึงตารางออกมาจาก json
const getTables = (db) => db?.tables || {};

// นับจำนวนวันระหว่าง 2 วันที่
const daysBetween = (a, b) =>
  Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

// ---------- 1) Summary cards ----------
const computeSummary = (db) => {
  const cylinders = getTables(db).gas_cylinder || [];

  const total_cylinders = cylinders.length;

  const in_stock = cylinders.filter((c) => c.status === "ในคลัง").length;

  const expired = cylinders.filter((c) => {
    if (!c.expiry_date) return false;
    return new Date(c.expiry_date) < TODAY;
  }).length;

  const ready = cylinders.filter((c) => {
    if (!c.expiry_date) return false;
    return c.status === "ในคลัง" && new Date(c.expiry_date) >= TODAY;
  }).length;

  return { total_cylinders, in_stock, ready, expired };
};

// ---------- 2) Topbar stats ----------
const computeTopbarStats = (db) => {
  const t = getTables(db);
  const storage = t.gas_storage || [];
  const maintenance = t.maintenance || [];
  const cylinders = t.gas_cylinder || [];
  const delivery = t.delivery || [];

  // gasLevel = % เฉลี่ยของถังเก็บ (ถ้าไม่มีข้อมูลให้ 0)
  const gasLevel = storage.length
    ? Math.round(
        storage.reduce((sum, s) => sum + (Number(s.level) || 0), 0) /
          storage.length
      )
    : 0;

  // maintenance ที่ยังไม่เสร็จ
  const maintenanceCount = maintenance.filter(
    (m) => m.status !== "done" && m.status !== "completed"
  ).length;

  // ถังที่หมดอายุแล้ว
  const expiredCount = cylinders.filter(
    (c) => c.expiry_date && new Date(c.expiry_date) < TODAY
  ).length;

  // delivery ที่สำเร็จ
  const successCount = delivery.filter(
    (d) => d.status === "delivered" || d.status === "success"
  ).length;

  return { gasLevel, maintenanceCount, expiredCount, successCount };
};

// ---------- 3) รอบส่งของพนักงาน ----------
const computeStaffRounds = (db) => {
  const t = getTables(db);
  const delivery = t.delivery || [];
  const staffList = t.delivery_staff || [];

  const counts = {};
  delivery.forEach((d) => {
    const name =
      d.staff_name ||
      staffList.find((s) => s.staff_id === d.staff_id)?.staff_name ||
      "-";
    counts[name] = (counts[name] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([staff_name, count]) => ({ staff_name, count }))
    .sort((a, b) => b.count - a.count);
};

// ---------- 4) ถังใกล้ถึงกำหนดตรวจ (ภายใน 30 วัน) ----------
const computeNearDue = (db) => {
  const cylinders = getTables(db).gas_cylinder || [];

  return cylinders
    .filter((c) => c.next_check_date)
    .map((c) => ({
      cylinder_id: c.cylinder_id,
      serial_number: c.serial_number,
      next_check_date: c.next_check_date,
      days_left: daysBetween(new Date(c.next_check_date), TODAY),
    }))
    .filter((c) => c.days_left <= 30)
    .sort((a, b) => a.days_left - b.days_left);
};

// ---------- 5) กราฟจำนวนถังแยกตามประเภทแก๊ส ----------
const computeGasTypeChart = (db) => {
  const cylinders = getTables(db).gas_cylinder || [];

  const counts = {};
  cylinders.forEach((c) => {
    const type = c.gas_type || "ไม่ระบุ";
    counts[type] = (counts[type] || 0) + 1;
  });

  return Object.entries(counts).map(([gas_type, total]) => ({
    gas_type,
    total,
  }));
};

// ---------- 6) กราฟออเดอร์รายวัน ----------
const computeDeliveryChart = (db) => {
  const delivery = getTables(db).delivery || [];

  const counts = {};
  delivery.forEach((d) => {
    const day = (d.delivered_date || d.created_at || "").slice(0, 10);
    if (!day) return;
    counts[day] = (counts[day] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([delivery_day, total_orders]) => ({ delivery_day, total_orders }))
    .sort((a, b) => a.delivery_day.localeCompare(b.delivery_day));
};

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------
function Dashboard() {
  // คำนวณข้อมูลจาก mockDb ครั้งเดียว (ข้อมูล static)
  const summary = useMemo(() => computeSummary(mockDb), []);
  const topbarStats = useMemo(() => computeTopbarStats(mockDb), []);
  const staffRounds = useMemo(() => computeStaffRounds(mockDb), []);
  const nearDueCylinders = useMemo(() => computeNearDue(mockDb), []);
  const gasTypeData = useMemo(() => computeGasTypeChart(mockDb), []);
  const deliveryChartData = useMemo(() => computeDeliveryChart(mockDb), []);

  return (
    <Layout
      gasLevel={topbarStats.gasLevel}
      maintenanceDueItems={new Array(topbarStats.maintenanceCount).fill(0)}
      expiredCylinderItems={new Array(topbarStats.expiredCount).fill(0)}
      deliverySuccessItems={new Array(topbarStats.successCount).fill(0)}
    >
      <div style={pageStyle}>
        <h1 style={titleStyle}>Dashboard</h1>

        {/* ========== SUMMARY CARDS ========== */}
        <div style={cardGridStyle}>
          <Card title="ถังทั้งหมด" value={summary.total_cylinders} />
          <Card title="ในคลัง" value={summary.in_stock} />
          <Card title="พร้อมใช้งาน" value={summary.ready} />
          <Card title="หมดอายุ" value={summary.expired} />
        </div>

        <div style={panelStyle}>
          <h2 style={panelTitleStyle}>จำนวนถังแยกตามประเภทแก๊ส</h2>
          {gasTypeData.length === 0 ? (
            <div style={emptyTextStyle}>ไม่มีข้อมูล</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={gasTypeData}>
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                />
                <XAxis
                  dataKey="gas_type"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                />
                <Tooltip />
                <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ========== GRAPH 2: ออเดอร์รายวัน ========== */}
        <div style={panelStyle}>
          <h2 style={panelTitleStyle}>จำนวนออเดอร์ส่งมอบรายวัน</h2>
          {deliveryChartData.length === 0 ? (
            <div style={emptyTextStyle}>ไม่มีข้อมูล</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={deliveryChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="delivery_day"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total_orders"
                  stroke="#22c55e"
                  strokeWidth={3}
                  name="จำนวนออเดอร์"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ========== STAFF DELIVERY ROUNDS ========== */}
        <div style={panelStyle}>
          <h2 style={panelTitleStyle}>รอบส่งพนักงาน</h2>
          {staffRounds.length === 0 ? (
            <div style={emptyTextStyle}>ยังไม่มีข้อมูลการส่ง</div>
          ) : (
            staffRounds.map((item, idx) => (
              <div key={item.staff_name || idx} style={listRowStyle}>
                <span>
                  #{idx + 1} {item.staff_name} {idx === 0 && "🏆"}
                </span>
                <strong>{item.count} รอบ</strong>
              </div>
            ))
          )}
        </div>

        {/* ========== NEAR DUE CYLINDERS ========== */}
        <div style={panelStyle}>
          <h2 style={panelTitleStyle}>ถังใกล้ถึงกำหนดตรวจ (30 วัน)</h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>รหัสถัง</th>
                <th style={thStyle}>วันตรวจครั้งถัดไป</th>
                <th style={thStyle}>คงเหลือ (วัน)</th>
              </tr>
            </thead>
            <tbody>
              {nearDueCylinders.length === 0 ? (
                <tr>
                  <td colSpan="3" align="center" style={{ padding: "20px" }}>
                    ไม่มีถังใกล้หมดอายุ
                  </td>
                </tr>
              ) : (
                nearDueCylinders.map((item, index) => (
                  <tr key={item.cylinder_id || item.serial_number || index}>
                    <td style={tdStyle}>
                      {item.serial_number || item.cylinder_id || "-"}
                    </td>
                    <td style={tdStyle}>{item.next_check_date || "-"}</td>
                    <td
                      style={{
                        ...tdStyle,
                        color:
                          (item.days_left || 0) <= 0 ? "#ef4444" : "#f59e0b",
                      }}
                    >
                      {item.days_left ?? "-"} วัน
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

// ------------------------------------------------------------
// Sub-component + Styles
// ------------------------------------------------------------
const Card = ({ title, value }) => (
  <div style={summaryCardStyle}>
    <div>{title}</div>
    <h2>{value}</h2>
  </div>
);

const pageStyle = { padding: "24px", color: "white" };
const titleStyle = { fontSize: "32px", marginBottom: "20px" };
const cardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "16px",
  marginBottom: "20px",
};
const summaryCardStyle = {
  background: "#1f2937",
  padding: "16px",
  borderRadius: "12px",
};
const panelStyle = {
  background: "#1f2937",
  padding: "20px",
  borderRadius: "12px",
  marginBottom: "20px",
};
const panelTitleStyle = { marginBottom: "16px" };
const emptyTextStyle = {
  color: "#cbd5e1",
  textAlign: "center",
  padding: "40px",
};
const listRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  padding: "10px",
  background: "#111827",
  borderRadius: "8px",
  marginBottom: "8px",
};
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};
const thStyle = { padding: "12px", borderBottom: "1px solid #374151" };
const tdStyle = { padding: "12px", borderBottom: "1px solid #374151" };

export default Dashboard;