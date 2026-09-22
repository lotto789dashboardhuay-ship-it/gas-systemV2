import { useState, useEffect, useMemo, useRef } from "react";
import Layout from "../components/Layout";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่าน/เขียนไฟล์จริงผ่าน Vite API -> /api/data
//   - เก็บสำเนาใน localStorage (offline fallback)
// ====================================================
const DB_KEY = "gas_system_db_v1";
const API_URL = "/api/data";

const clone = (obj) => JSON.parse(JSON.stringify(obj));

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

// ---------- localStorage ----------
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
const saveLocalDb = (db) => {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn("saveLocalDb error:", e);
  }
};

// ---------- API ----------
const fetchFileDb = async () => {
  const res = await fetch(API_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
const writeFileDb = async (db) => {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(db),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
};

// ---------- ID generator ----------
const genStaffId = (list) => {
  const nums = list
    .map((s) => parseInt(String(s.staff_id || "").replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `STF${String(next).padStart(3, "0")}`;
};

// ---------- Utils ----------
const removeEmojis = (text) => {
  if (!text) return "";
  return String(text)
    .replace(
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      ""
    )
    .trim();
};

// ====================================================
// Component
// ====================================================
function StaffPage() {
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [apiAvailable, setApiAvailable] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle");

  const loadedDbRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const saveInFlightRef = useRef(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [formData, setFormData] = useState({
    staff_name: "",
    staff_phone: "",
    username: "",
    password: "",
    address: "",
    status: "active",
  });

  // ---------- Load on mount ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fileDb = await fetchFileDb();
        if (cancelled) return;
        if (!fileDb || !fileDb.tables) throw new Error("Data.json ไม่ถูกรูปแบบ");
        const norm = normalizeDb(fileDb);
        loadedDbRef.current = norm;
        setDb(norm);
        setApiAvailable(true);
      } catch (err) {
        console.warn("โหลดจาก /api/data ไม่ได้ -> ใช้ localStorage:", err);
        if (cancelled) return;
        setApiAvailable(false);
        setSyncStatus("offline");
        const local = loadLocalDb();
        if (local?.tables) {
          const norm = normalizeDb(local);
          loadedDbRef.current = norm;
          setDb(norm);
        } else {
          const norm = emptyDb();
          loadedDbRef.current = norm;
          setDb(norm);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Persist to localStorage ----------
  useEffect(() => {
    if (db) saveLocalDb(db);
  }, [db]);

  // ---------- Realtime auto-save ----------
  useEffect(() => {
    if (!db || loading) return;
    if (db === loadedDbRef.current) return;
    if (!apiAvailable) return;

    pendingSaveRef.current = db;

    const drain = async () => {
      if (saveInFlightRef.current) return;
      saveInFlightRef.current = true;
      setSyncStatus("saving");
      try {
        while (pendingSaveRef.current) {
          const toSave = pendingSaveRef.current;
          pendingSaveRef.current = null;
          await writeFileDb(toSave);
        }
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 1500);
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSyncStatus("error");
      } finally {
        saveInFlightRef.current = false;
        if (pendingSaveRef.current) drain();
      }
    };

    drain();
  }, [db, loading, apiAvailable]);

  // ---------- Flush before unload ----------
  useEffect(() => {
    const flush = () => {
      if (!pendingSaveRef.current || !apiAvailable) return;
      try {
        const blob = new Blob([JSON.stringify(pendingSaveRef.current)], {
          type: "application/json",
        });
        navigator.sendBeacon?.(API_URL, blob);
      } catch (_) {}
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [apiAvailable]);

  // ---------- Auto-hide message ----------
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => setMessage({ type: "", text: "" }), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // ---------- Update helper ----------
  const updateDb = (updater) => {
    setDb((prev) => {
      const next = clone(prev || emptyDb());
      updater(next);
      return next;
    });
  };

  // ====================================================
  // Derived data
  // ====================================================
  const tables = db?.tables || {};
  const staffs = tables.delivery_staff || [];
  const deliveries = tables.delivery || [];

  // นับ pending/delivering jobs ต่อพนักงาน (คำนวณจาก delivery table)
  const staffJobCounts = useMemo(() => {
    const counts = {};
    deliveries.forEach((d) => {
      const sid = String(d.staff_id ?? d.staffId ?? "").trim();
      if (!sid) return;
      const status = (d.status || "").toLowerCase();
      if (status === "pending" || status === "delivering") {
        counts[sid] = (counts[sid] || 0) + 1;
      }
    });
    return counts;
  }, [deliveries]);

  // ====================================================
  // Validation
  // ====================================================
  const validatePhone = (phone) => {
    const phoneRegex = /^[0-9]{9,10}$/;
    return phoneRegex.test(phone.replace(/[-\s]/g, ""));
  };

  const validateForm = () => {
    if (!formData.staff_name.trim()) {
      setMessage({ type: "error", text: "กรุณากรอกชื่อพนักงาน" });
      return false;
    }
    if (!formData.staff_phone.trim()) {
      setMessage({ type: "error", text: "กรุณากรอกเบอร์โทร" });
      return false;
    }
    if (!validatePhone(formData.staff_phone)) {
      setMessage({
        type: "error",
        text: "กรุณากรอกเบอร์โทรให้ถูกต้อง (ตัวเลข 9-10 หลัก)",
      });
      return false;
    }
    if (!formData.username.trim()) {
      setMessage({ type: "error", text: "กรุณากรอก Username" });
      return false;
    }
    if (!editingStaffId && formData.password.trim().length < 4) {
      setMessage({
        type: "error",
        text: "รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร",
      });
      return false;
    }
    if (
      editingStaffId &&
      formData.password.trim() &&
      formData.password.trim().length < 4
    ) {
      setMessage({
        type: "error",
        text: "รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร",
      });
      return false;
    }
    return true;
  };

  const clearForm = () => {
    setFormData({
      staff_name: "",
      staff_phone: "",
      username: "",
      password: "",
      address: "",
      status: "active",
    });
    setEditingStaffId(null);
    setMessage({ type: "", text: "" });
  };

  // ====================================================
  // Save staff
  // ====================================================
  const saveStaff = (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) return;

    const payload = {
      staff_name: formData.staff_name.trim(),
      staff_phone: formData.staff_phone.trim().replace(/[-\s]/g, ""),
      username: formData.username.trim(),
      address: formData.address.trim(),
      status: formData.status,
    };
    if (formData.password.trim() !== "") {
      payload.password = formData.password.trim();
    }

    setIsSubmitting(true);
    try {
      if (editingStaffId) {
        // แก้ไข
        const dup = staffs.some(
          (s) =>
            s.staff_id !== editingStaffId &&
            String(s.username || "").trim() === payload.username
        );
        if (dup) {
          setMessage({ type: "error", text: "Username นี้ถูกใช้งานแล้ว" });
          setIsSubmitting(false);
          return;
        }

        updateDb((draft) => {
          const list = draft.tables.delivery_staff || [];
          const idx = list.findIndex((s) => s.staff_id === editingStaffId);
          if (idx >= 0) {
            const updated = {
              ...list[idx],
              ...payload,
              updated_at: new Date().toISOString(),
            };
            if (!payload.password) delete updated.password_updated_marker;
            list[idx] = updated;
          }
        });

        setMessage({ type: "success", text: "แก้ไขข้อมูลพนักงานสำเร็จ" });
        clearForm();
      } else {
        // เพิ่มใหม่
        const dup = staffs.some(
          (s) => String(s.username || "").trim() === payload.username
        );
        if (dup) {
          setMessage({ type: "error", text: "Username นี้ถูกใช้งานแล้ว" });
          setIsSubmitting(false);
          return;
        }

        updateDb((draft) => {
          const list = draft.tables.delivery_staff || [];
          const now = new Date().toISOString();
          list.push({
            staff_id: genStaffId(list),
            ...payload,
            created_at: now,
            updated_at: now,
          });
        });

        setMessage({ type: "success", text: "เพิ่มพนักงานสำเร็จ" });
        clearForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ====================================================
  // Edit / Delete
  // ====================================================
  const editStaff = (staff) => {
    setFormData({
      staff_name: staff.staff_name || "",
      staff_phone: staff.staff_phone || "",
      username: staff.username || "",
      password: "",
      address: staff.address || "",
      status: staff.status || "active",
    });
    setEditingStaffId(staff.staff_id);
    setMessage({ type: "", text: "" });
  };

  const deleteStaff = (staffId, staffName) => {
    if (!window.confirm(`ยืนยันลบพนักงาน "${staffName}"?`)) return;

    updateDb((draft) => {
      draft.tables.delivery_staff = (draft.tables.delivery_staff || []).filter(
        (s) => s.staff_id !== staffId
      );
    });

    setMessage({ type: "success", text: "ลบพนักงานสำเร็จ" });
    if (editingStaffId === staffId) clearForm();
  };

  // ====================================================
  // Filter
  // ====================================================
  const filteredStaffs = staffs.filter((staff) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      (staff.staff_name && staff.staff_name.toLowerCase().includes(term)) ||
      (staff.staff_phone && staff.staff_phone.includes(term)) ||
      (staff.username && staff.username.toLowerCase().includes(term)) ||
      (staff.address && staff.address.toLowerCase().includes(term));

    const matchesStatus =
      statusFilter === "all" || staff.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // ---------- Sync label ----------
  const syncLabel = () => {
    if (!apiAvailable) return "⚠️ โหมดออฟไลน์ (บันทึกลง localStorage)";
    if (syncStatus === "saving") return "⏳ กำลังบันทึก Data.json...";
    if (syncStatus === "saved") return "✅ บันทึก Data.json แล้ว";
    if (syncStatus === "error") return "❌ บันทึกไม่สำเร็จ";
    return "(realtime auto-sync)";
  };

  // ====================================================
  // Render
  // ====================================================
  if (loading) {
    return (
      <Layout>
        <div style={{ color: "white", textAlign: "center", padding: "50px" }}>
          ⏳ กำลังโหลดข้อมูลจาก Data.json...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
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
        <h1 style={{ margin: 0, color: "white" }}>จัดการพนักงานส่ง</h1>
        <span
          style={{
            color: apiAvailable ? "#22c55e" : "#f59e0b",
            fontSize: "12px",
          }}
        >
          {syncLabel()}
        </span>
      </div>

      {message.text && (
        <div
          style={{
            padding: "10px 15px",
            borderRadius: "8px",
            marginBottom: "15px",
            backgroundColor: message.type === "success" ? "#22c55e" : "#ef4444",
            color: "white",
            fontWeight: "bold",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={saveStaff} style={formCardStyle}>
        <h2 style={{ marginTop: 0, color: "white" }}>
          {editingStaffId ? "แก้ไขพนักงาน" : "เพิ่มพนักงานใหม่"}
        </h2>

        <div style={formGridStyle}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>ชื่อพนักงาน *</label>
            <input
              value={formData.staff_name}
              onChange={(e) =>
                setFormData({ ...formData, staff_name: e.target.value })
              }
              style={inputStyle}
              placeholder="ชื่อ-นามสกุล"
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>เบอร์โทร *</label>
            <input
              value={formData.staff_phone}
              onChange={(e) =>
                setFormData({ ...formData, staff_phone: e.target.value })
              }
              style={inputStyle}
              placeholder="0812345678"
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Username *</label>
            <input
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              style={inputStyle}
              placeholder="username"
              disabled={!!editingStaffId}
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              {editingStaffId
                ? "รหัสผ่าน (เว้นว่างไว้ไม่เปลี่ยน)"
                : "รหัสผ่าน *"}
            </label>
            <input
              type="text"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              style={inputStyle}
              placeholder={
                editingStaffId
                  ? "รหัสผ่านใหม่ (อย่างน้อย 4 ตัว)"
                  : "รหัสผ่าน (อย่างน้อย 4 ตัว)"
              }
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>ที่อยู่</label>
            <input
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              style={inputStyle}
              placeholder="ที่อยู่"
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>สถานะ</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
              style={inputStyle}
            >
              <option value="active">ใช้งาน</option>
              <option value="inactive">ไม่ใช้งาน</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <button
            type="submit"
            style={primaryButtonStyle}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "กำลังบันทึก..."
              : editingStaffId
              ? "บันทึก"
              : "เพิ่ม"}
          </button>
          {editingStaffId && (
            <button
              type="button"
              onClick={clearForm}
              style={secondaryButtonStyle}
            >
              ยกเลิก
            </button>
          )}
        </div>
      </form>

      {/* Filter Container */}
      <div style={filterContainerStyle}>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <input
            type="text"
            placeholder="ค้นหา (ชื่อ, เบอร์โทร, Username, ที่อยู่)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ width: "160px" }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">สถานะทั้งหมด</option>
            <option value="active">ใช้งาน</option>
            <option value="inactive">ไม่ใช้งาน</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "90px" }}>ID</th>
              <th style={{ ...thStyle, width: "150px" }}>ชื่อ</th>
              <th style={{ ...thStyle, width: "120px" }}>เบอร์โทร</th>
              <th style={{ ...thStyle, width: "120px" }}>Username</th>
              <th style={{ ...thStyle, width: "200px" }}>ที่อยู่</th>
              <th style={{ ...thStyle, width: "100px" }}>สถานะ</th>
              <th style={{ ...thStyle, width: "110px" }}>สถานะงาน</th>
              <th style={{ ...thStyle, width: "90px" }}>จำนวนงาน</th>
              <th style={{ ...thStyle, width: "150px" }}>จัดการ</th>
            </tr>
          </thead>

          <tbody>
            {filteredStaffs.length > 0 ? (
              filteredStaffs.map((item, index) => {
                const pendingCount = Number(
                  staffJobCounts[String(item.staff_id)] || 0
                );
                const isWorking = pendingCount > 0;
                const isActive = (item.status || "active") === "active";

                return (
                  <tr key={`${item.staff_id || "staff"}-${index}`}>
                    <td
                      style={{ ...tdStyle, color: "#f59e0b", fontWeight: "bold" }}
                    >
                      {item.staff_id}
                    </td>
                    <td style={tdStyle}>
                      <strong>{removeEmojis(item.staff_name)}</strong>
                    </td>
                    <td style={tdStyle}>
                      {removeEmojis(item.staff_phone) || "-"}
                    </td>
                    <td style={tdStyle}>{removeEmojis(item.username)}</td>
                    <td style={tdStyle}>{removeEmojis(item.address) || "-"}</td>

                    {/* สถานะพนักงาน (ใช้งาน/ไม่ใช้งาน) */}
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...badgeStyle,
                          backgroundColor: isActive ? "#22c55e" : "#6b7280",
                          color: "white",
                        }}
                      >
                        {isActive ? "ใช้งาน" : "ไม่ใช้งาน"}
                      </span>
                    </td>

                    {/* สถานะงาน */}
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...badgeStyle,
                          backgroundColor: isWorking ? "#f59e0b" : "#10b981",
                          color: "white",
                        }}
                      >
                        {isWorking ? "กำลังส่ง" : "ว่าง"}
                      </span>
                    </td>

                    {/* จำนวนงานที่รอส่ง */}
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontWeight: "bold",
                          color: isWorking ? "#f59e0b" : "#9ca3af",
                        }}
                      >
                        {pendingCount} งาน
                      </span>
                    </td>

                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => editStaff(item)}
                        style={editButtonStyle}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          deleteStaff(item.staff_id, item.staff_name)
                        }
                        style={deleteButtonStyle}
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td style={{ ...tdStyle, textAlign: "center" }} colSpan="9">
                  ไม่พบข้อมูลพนักงานที่ค้นหา
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
// Styles
// ====================================================
const formCardStyle = {
  background: "#1f2937",
  color: "white",
  padding: "20px",
  borderRadius: "12px",
  marginBottom: "20px",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
  marginBottom: "16px",
};

const fieldGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const labelStyle = {
  fontSize: "13px",
  fontWeight: "bold",
  color: "#e5e7eb",
};

const inputStyle = {
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  width: "100%",
  boxSizing: "border-box",
};

const filterContainerStyle = {
  display: "flex",
  gap: "12px",
  marginBottom: "16px",
  flexWrap: "wrap",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#1f2937",
  color: "white",
  borderRadius: "12px",
  overflow: "hidden",
  tableLayout: "fixed",
};

const thStyle = {
  padding: "12px 10px",
  textAlign: "left",
  borderBottom: "1px solid #374151",
  fontSize: "13px",
  fontWeight: "bold",
  whiteSpace: "nowrap",
  backgroundColor: "#2d3a4a",
};

const tdStyle = {
  padding: "10px",
  textAlign: "left",
  borderBottom: "1px solid #374151",
  fontSize: "13px",
  wordBreak: "break-word",
  whiteSpace: "normal",
  verticalAlign: "middle",
};

const primaryButtonStyle = {
  padding: "10px 14px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};

const secondaryButtonStyle = {
  padding: "10px 14px",
  border: "none",
  borderRadius: "8px",
  background: "#6b7280",
  color: "white",
  cursor: "pointer",
};

const editButtonStyle = {
  marginRight: "8px",
  padding: "6px 10px",
  border: "none",
  borderRadius: "6px",
  background: "#f59e0b",
  color: "white",
  cursor: "pointer",
};

const deleteButtonStyle = {
  padding: "6px 10px",
  border: "none",
  borderRadius: "6px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
};

const badgeStyle = {
  padding: "4px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: "bold",
  whiteSpace: "nowrap",
  display: "inline-block",
  textAlign: "center",
};

export default StaffPage;