// src/components/RegisterCylinderModal.jsx
import { useEffect, useState, useRef } from "react";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่าน/เขียนไฟล์จริงผ่าน Vite API -> /api/data
//   - เก็บสำเนาใน localStorage (offline fallback)
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

const saveLocalDb = (db) => {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn("saveLocalDb error:", e);
  }
};

const loadLocalOptions = () => {
  try {
    const raw = localStorage.getItem(OPT_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
};

const saveLocalOptions = (opts) => {
  try {
    localStorage.setItem(OPT_KEY, JSON.stringify(opts));
  } catch (e) {}
};

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

const genCylinderId = (list) => {
  const nums = list
    .map((c) => parseInt(String(c.cylinder_id || "").replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `CYL${String(next).padStart(3, "0")}`;
};

// ====================================================
// Component
// ====================================================
function RegisterCylinderModal({
  isOpen,
  onClose,
  initialSerial,
  defaultLocation = "คลัง",
  onSuccess,
}) {
  const todayStr = new Date().toISOString().split("T")[0];

  const [formData, setFormData] = useState({
    serial_number: initialSerial || "",
    brand: "",
    gas_type: "LPG",
    size: "",
    manufacture_date: todayStr,
    expiry_date: "",
    qr_code: initialSerial || "",
    current_location: defaultLocation,
  });

  const [saving, setSaving] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [syncLabel, setSyncLabel] = useState("");

  // master options — merge default + derived จาก db
  const [options, setOptions] = useState({
    brands: ["ปตท.", "World Gas", "สยามแก๊ส", "ยูนิคแก๊ส", "PT Gas", "พีเอพี"],
    gas_types: ["LPG"],
    sizes: ["4 กก.", "7 กก.", "11.5 กก.", "13.5 กก.", "15 กก.", "48 กก."],
    locations: ["คลัง"],
  });

  const loadedOptionsRef = useRef(false);

  // ---------- Reset form เมื่อเปิด modal ----------
  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      serial_number: initialSerial || "",
      brand: "",
      gas_type: "LPG",
      size: "",
      manufacture_date: todayStr,
      expiry_date: "",
      qr_code: initialSerial || "",
      current_location: defaultLocation,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSerial, defaultLocation]);

  // ---------- โหลด options (ครั้งแรกที่เปิด) ----------
  useEffect(() => {
    if (!isOpen || loadedOptionsRef.current) return;
    loadedOptionsRef.current = true;

    (async () => {
      let db = null;
      let apiOk = true;
      try {
        db = normalizeDb(await fetchFileDb());
      } catch (err) {
        apiOk = false;
        db = normalizeDb(loadLocalDb() || emptyDb());
      }
      setApiAvailable(apiOk);

      // merge กับ options ที่ผู้ใช้บันทึกไว้
      const savedOpts = loadLocalOptions() || {};
      const cylinders = db.tables.gas_cylinder || [];
      const uniq = (arr) =>
        [...new Set(arr.filter((v) => v && String(v).trim()))];

      const derivedBrands = uniq(cylinders.map((c) => c.brand));
      const derivedGasTypes = uniq(cylinders.map((c) => c.gas_type));
      const derivedSizes = uniq(cylinders.map((c) => c.size));
      const derivedLocations = uniq(cylinders.map((c) => c.current_location));

      const mergeUnique = (...arrs) => {
        const all = arrs.flat().filter((v) => v && String(v).trim());
        return [...new Set(all)];
      };

      setOptions({
        brands: mergeUnique(
          ["ปตท.", "World Gas", "สยามแก๊ส", "ยูนิคแก๊ส", "PT Gas", "พีเอพี"],
          savedOpts.brands || [],
          derivedBrands
        ),
        gas_types: mergeUnique(
          ["LPG"],
          savedOpts.gas_types || [],
          derivedGasTypes
        ),
        sizes: mergeUnique(
          ["4 กก.", "7 กก.", "11.5 กก.", "13.5 กก.", "15 กก.", "48 กก."],
          savedOpts.sizes || [],
          derivedSizes
        ),
        locations: mergeUnique(["คลัง"], savedOpts.locations || [], derivedLocations),
      });
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  // ---------- Helpers ----------
  const calculateExpiry = (manuDate) => {
    if (!manuDate) return "";
    const d = new Date(manuDate);
    if (isNaN(d.getTime())) return "";
    d.setFullYear(d.getFullYear() + 5);
    return d.toISOString().split("T")[0];
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "manufacture_date") {
        updated.expiry_date = calculateExpiry(value);
      }
      return updated;
    });
  };

  // ====================================================
  // Submit — เขียนลง Data.json ผ่าน /api/data
  // ====================================================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !formData.serial_number ||
      !formData.brand ||
      !formData.size ||
      !formData.manufacture_date
    ) {
      alert("กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วน");
      return;
    }

    const serial = formData.serial_number.trim();
    const expiry = formData.expiry_date || calculateExpiry(formData.manufacture_date);

    const payload = {
      serial_number: serial,
      brand: formData.brand,
      gas_type: formData.gas_type || "LPG",
      size: formData.size,
      manufacture_date: formData.manufacture_date,
      expiry_date: expiry,
      last_check_date: formData.manufacture_date,
      next_check_date: expiry,
      current_location: formData.current_location || defaultLocation,
      status: "ในคลัง",
      qr_code: formData.qr_code || serial,
    };

    setSaving(true);
    setSyncLabel("⏳ กำลังบันทึก...");

    try {
      // 1) อ่าน db ล่าสุด (เพื่อกันทับข้อมูลที่คนอื่นเพิ่ม)
      let db;
      let apiOk = true;
      try {
        db = normalizeDb(await fetchFileDb());
      } catch (err) {
        apiOk = false;
        db = normalizeDb(loadLocalDb() || emptyDb());
      }
      setApiAvailable(apiOk);

      const list = db.tables.gas_cylinder || [];

      // 2) กันซ้ำ
      const dup = list.some(
        (c) => String(c.serial_number || "").trim() === serial
      );
      if (dup) {
        alert(`Serial Number "${serial}" มีอยู่ในระบบแล้ว`);
        setSyncLabel("");
        setSaving(false);
        return;
      }

      // 3) push cylinder ใหม่
      const now = new Date().toISOString();
      const newCylinder = {
        cylinder_id: genCylinderId(list),
        ...payload,
        assigned_to: null,
        assigned_date: null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      };
      list.push(newCylinder);
      db.tables.gas_cylinder = list;

      // 4) บันทึก
      if (apiOk) {
        await writeFileDb(db);
        saveLocalDb(db);
        setSyncLabel("✅ บันทึก Data.json แล้ว");
      } else {
        saveLocalDb(db);
        setSyncLabel("⚠️ โหมดออฟไลน์ (บันทึกลง localStorage)");
      }

      // 5) อัปเดต options ใน localStorage ให้สอดคล้อง
      const savedOpts = loadLocalOptions() || {};
      const mergeArr = (a, b) => [...new Set([...(a || []), ...(b || [])])];
      saveLocalOptions({
        brands: mergeArr(savedOpts.brands, [payload.brand]),
        gas_types: mergeArr(savedOpts.gas_types, [payload.gas_type]),
        sizes: mergeArr(savedOpts.sizes, [payload.size]),
        locations: mergeArr(savedOpts.locations, [payload.current_location]),
      });

      alert(`ลงทะเบียนถังแก๊สใหม่สำเร็จ (${newCylinder.cylinder_id})`);

      if (typeof onSuccess === "function") {
        onSuccess(newCylinder);
      }
      onClose();

      setTimeout(() => setSyncLabel(""), 1200);
    } catch (err) {
      console.error("Register cylinder error:", err);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + (err.message || "unknown"));
      setSyncLabel("❌ บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.content}>
        <h3 style={{ marginTop: 0, color: "#fff" }}>
          ➕ ลงทะเบียนถังแก๊สใหม่เข้าระบบ
        </h3>
        <p style={{ fontSize: "13px", color: "#9ca3af" }}>
          ไม่พบ Serial Number{" "}
          <strong style={{ color: "#facc15" }}>{formData.serial_number}</strong>{" "}
          ในฐานข้อมูล
        </p>

        {/* Sync status */}
        <div
          style={{
            fontSize: "11px",
            color: apiAvailable ? "#22c55e" : "#f59e0b",
            marginBottom: "8px",
          }}
        >
          {syncLabel ||
            (apiAvailable
              ? "🟢 เชื่อมต่อ Data.json"
              : "🟠 โหมดออฟไลน์ (localStorage)")}
        </div>

        <form onSubmit={handleSubmit} style={modalStyles.formGrid}>
          <div>
            <label style={modalStyles.label}>Serial Number *</label>
            <input
              style={modalStyles.input}
              value={formData.serial_number}
              onChange={(e) => handleChange("serial_number", e.target.value)}
              required
            />
          </div>

          <div>
            <label style={modalStyles.label}>ยี่ห้อ *</label>
            <select
              style={modalStyles.input}
              value={formData.brand}
              onChange={(e) => handleChange("brand", e.target.value)}
              required
            >
              <option value="">-- เลือกยี่ห้อ --</option>
              {options.brands.map((b, i) => (
                <option key={i} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={modalStyles.label}>ชนิดแก๊ส *</label>
            <select
              style={modalStyles.input}
              value={formData.gas_type}
              onChange={(e) => handleChange("gas_type", e.target.value)}
            >
              {options.gas_types.map((g, i) => (
                <option key={i} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={modalStyles.label}>ขนาดถัง *</label>
            <select
              style={modalStyles.input}
              value={formData.size}
              onChange={(e) => handleChange("size", e.target.value)}
              required
            >
              <option value="">-- เลือกขนาด --</option>
              {options.sizes.map((s, i) => (
                <option key={i} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={modalStyles.label}>วันที่ผลิต *</label>
            <input
              type="date"
              style={modalStyles.input}
              value={formData.manufacture_date}
              onChange={(e) =>
                handleChange("manufacture_date", e.target.value)
              }
              required
            />
          </div>

          <div>
            <label style={modalStyles.label}>
              วันหมดอายุ (อัตโนมัติ +5 ปี)
            </label>
            <input
              type="date"
              style={{
                ...modalStyles.input,
                background: "#374151",
                color: "#9ca3af",
              }}
              value={
                formData.expiry_date ||
                calculateExpiry(formData.manufacture_date)
              }
              disabled
            />
          </div>

          <div>
            <label style={modalStyles.label}>สถานที่ปัจจุบัน</label>
            <select
              style={modalStyles.input}
              value={formData.current_location}
              onChange={(e) =>
                handleChange("current_location", e.target.value)
              }
            >
              {options.locations.map((loc, i) => (
                <option key={i} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{ display: "flex", gap: "8px", marginTop: "16px" }}
          >
            <button
              type="button"
              onClick={onClose}
              style={modalStyles.cancelBtn}
              disabled={saving}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              style={{
                ...modalStyles.submitBtn,
                opacity: saving ? 0.6 : 1,
                cursor: saving ? "wait" : "pointer",
              }}
              disabled={saving}
            >
              {saving ? "กำลังบันทึก..." : "💾 บันทึกเข้าฐานข้อมูล"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ====================================================
// Styles
// ====================================================
const modalStyles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "16px",
  },
  content: {
    background: "#1f2937",
    padding: "20px",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "480px",
    maxHeight: "90vh",
    overflowY: "auto",
    boxSizing: "border-box",
  },
  formGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    color: "#9ca3af",
    marginBottom: "4px",
  },
  input: {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #4b5563",
    background: "#ffffff",
    color: "#111827",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  submitBtn: {
    flex: 1,
    padding: "12px",
    border: "none",
    borderRadius: "8px",
    background: "#2563eb",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
  cancelBtn: {
    flex: 1,
    padding: "12px",
    border: "none",
    borderRadius: "8px",
    background: "#4b5563",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
};

export default RegisterCylinderModal;