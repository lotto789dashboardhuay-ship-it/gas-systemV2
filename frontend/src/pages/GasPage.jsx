import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import Layout from "../components/Layout";
import { QRCodeSVG } from "qrcode.react";

// ====================================================
// Persistence
//   - อ่าน/เขียนไฟล์จริงผ่าน Vite API  -> /api/data
//     (ตัว middleware จะเขียนลง src/pages/Data.json)
//   - เก็บสำเนาใน localStorage (offline fallback)
// ====================================================
const DB_KEY = "gas_system_db_v1";
const OPT_KEY = "gas_system_options_v1";
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

// ---------- API (Vite middleware) ----------
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

// ---------- Options / IDs ----------
const deriveOptions = (cylinders) => {
  const uniq = (arr) => [...new Set(arr.filter((v) => v && String(v).trim()))];
  return {
    brands: uniq(cylinders.map((c) => c.brand)),
    gas_types: uniq(cylinders.map((c) => c.gas_type)),
    sizes: uniq(cylinders.map((c) => c.size)),
    locations: uniq(cylinders.map((c) => c.current_location)),
  };
};

const genCylinderId = (list) => {
  const nums = list
    .map((c) =>
      parseInt(String(c.cylinder_id || "").replace(/\D/g, ""), 10)
    )
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `CYL${String(next).padStart(3, "0")}`;
};

// ---------- Misc ----------
const downloadJson = (data, filename = "Data.json") => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const readJsonFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });

// ====================================================
// Component
// ====================================================
function GasPage() {
  const [db, setDb] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error | offline

  const loadedDbRef = useRef(null); // อ้างอิง object ที่โหลดมาตอนแรก (ข้ามการ save รอบแรก)

  // ---------- Realtime save queue ----------
  const pendingSaveRef = useRef(null); // db ล่าสุดที่ยังไม่ได้เขียน
  const saveInFlightRef = useRef(false); // กำลังเขียนอยู่หรือไม่

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
        setOptions(
          loadLocalOptions() || deriveOptions(norm.tables.gas_cylinder)
        );
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
          setOptions(
            loadLocalOptions() || deriveOptions(norm.tables.gas_cylinder)
          );
        } else {
          const norm = emptyDb();
          loadedDbRef.current = norm;
          setDb(norm);
          setOptions(deriveOptions([]));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Persist to localStorage (สำรอง) ----------
  useEffect(() => {
    if (db) saveLocalDb(db);
  }, [db]);
  useEffect(() => {
    if (options) saveLocalOptions(options);
  }, [options]);

  // ---------- Realtime auto-save ลง Data.json ----------
  // ทำงานทันทีเมื่อ db เปลี่ยน (ไม่มี debounce)
  // ใช้ queue: ถ้ามีการแก้หลายครั้งเร็ว ๆ จะเขียนแค่ครั้งสุดท้าย (coalesce)
  useEffect(() => {
    if (!db || loading) return;
    if (db === loadedDbRef.current) return; // ข้ามรอบแรก
    if (!apiAvailable) return;

    pendingSaveRef.current = db;

    const drain = async () => {
      if (saveInFlightRef.current) return; // มีลูปทำงานอยู่แล้ว
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
        // ถ้ามี pending ใหม่ระหว่างปิด loop → เรียกซ้ำ
        if (pendingSaveRef.current) drain();
      }
    };

    drain();
  }, [db, loading, apiAvailable]);

  // ---------- Flush ก่อนปิดหน้า ----------
  useEffect(() => {
    const flush = () => {
      if (!pendingSaveRef.current || !apiAvailable) return;
      try {
        const blob = new Blob(
          [JSON.stringify(pendingSaveRef.current)],
          { type: "application/json" }
        );
        navigator.sendBeacon?.(API_URL, blob);
      } catch (_) {}
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [apiAvailable]);

  // ---------- Update helpers ----------
  const updateDb = (updater) => {
    setDb((prev) => {
      const next = clone(prev || emptyDb());
      updater(next);
      return next;
    });
  };

  const updateOptions = (updater) => {
    setOptions((prev) => {
      const next = clone(prev || {});
      updater(next);
      return next;
    });
  };

  // ---------- Manual actions ----------
  const handleReloadFromFile = async () => {
    if (
      !window.confirm(
        "โหลดข้อมูลจากไฟล์ Data.json ใหม่? (การแก้ไขที่ยังไม่บันทึกจะหายไป)"
      )
    )
      return;
    try {
      const fileDb = await fetchFileDb();
      if (!fileDb.tables) throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
      const norm = normalizeDb(fileDb);
      loadedDbRef.current = norm;
      setDb(norm);
      setOptions(deriveOptions(norm.tables.gas_cylinder));
      setSyncStatus("saved");
      setTimeout(() => setSyncStatus("idle"), 1500);
    } catch (err) {
      alert("โหลดไฟล์ไม่สำเร็จ: " + err.message);
    }
  };

  const handleManualSave = async () => {
    if (!db) return;

    // flush pending ก่อน (กัน state ล่าสุดตกหล่น)
    const toSave = pendingSaveRef.current || db;
    pendingSaveRef.current = null;

    if (apiAvailable) {
      try {
        setSyncStatus("saving");
        await writeFileDb(toSave);
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 1500);
      } catch (err) {
        alert("บันทึกไฟล์ไม่สำเร็จ: " + err.message);
        setSyncStatus("error");
      }
    } else {
      downloadJson(toSave, "Data.json");
    }
  };

  const handleImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const parsed = await readJsonFile(f);
        if (!parsed.tables) throw new Error("ไฟล์ JSON ไม่ถูกรูปแบบ");
        const norm = normalizeDb(parsed);
        setDb(norm);
        setOptions(deriveOptions(norm.tables.gas_cylinder));
        alert("นำเข้าข้อมูลสำเร็จ (ระบบจะเขียนลง Data.json อัตโนมัติ)");
      } catch (err) {
        alert("อ่านไฟล์ไม่สำเร็จ: " + err.message);
      }
    };
    input.click();
  };

  // ---------- Extract tables ----------
  const tables = db?.tables || {};
  const cylinders = tables.gas_cylinder || [];
  const rawDeliveries = tables.delivery || [];
  const customers = tables.customer || [];

  const deliveries = useMemo(() => {
    return rawDeliveries.map((d) => {
      const cust = customers.find((c) => c.customer_id === d.customer_id);
      return {
        ...d,
        customer_name: d.customer_name || cust?.name || "",
        address: d.address || cust?.address || "",
      };
    });
  }, [rawDeliveries, customers]);

  // ---------- UI state ----------
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [manageModal, setManageModal] = useState({
    open: false,
    type: "",
    title: "",
  });
  const [newItemText, setNewItemText] = useState("");
  const [qrModal, setQrModal] = useState({ open: false, cylinder: null });
  const [imageModal, setImageModal] = useState({
    open: false,
    imgSrc: "",
    rawPath: "",
    serial: "",
  });

  const initialFormState = {
    serial_number: "",
    brand: "",
    gas_type: "",
    size: "",
    manufacture_date: "",
    expiry_date: "",
    last_check_date: "",
    next_check_date: "",
    delivered_date: "",
    current_location: "",
    status: "ในคลัง",
  };
  const [formData, setFormData] = useState(initialFormState);

  // ---------- Helpers ----------
  const getQrUrl = (item) => {
    if (!item) return "#";
    const id = item.serial_number || item.cylinder_id || item.delivery_id;
    const cleanId = String(id || "").trim();
    if (
      cleanId &&
      cleanId !== "undefined" &&
      cleanId !== "null" &&
      cleanId !== "0"
    ) {
      return `http://${window.location.hostname}:5173/cylinder/${encodeURIComponent(
        cleanId
      )}`;
    }
    return "#";
  };

  const calculateDates = (mfgDate, lastCheckDate) => {
    let expiry = "";
    let nextCheck = "";
    if (mfgDate) {
      const d = new Date(mfgDate);
      d.setFullYear(d.getFullYear() + 10);
      expiry = d.toISOString().split("T")[0];
    }
    const base = lastCheckDate || mfgDate;
    if (base) {
      const d = new Date(base);
      d.setFullYear(d.getFullYear() + 5);
      nextCheck = d.toISOString().split("T")[0];
    }
    return { expiry, nextCheck };
  };

  const handleManufactureDateChange = (e) => {
    const mfgDate = e.target.value;
    const { expiry, nextCheck } = calculateDates(
      mfgDate,
      formData.last_check_date
    );
    setFormData((prev) => ({
      ...prev,
      manufacture_date: mfgDate,
      expiry_date: expiry,
      next_check_date: nextCheck,
    }));
  };

  const handleLastCheckDateChange = (e) => {
    const lastCheck = e.target.value;
    const { nextCheck } = calculateDates(formData.manufacture_date, lastCheck);
    setFormData((prev) => ({
      ...prev,
      last_check_date: lastCheck,
      next_check_date: nextCheck,
    }));
  };

  const clearForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
  };

  const editCylinder = (item) => {
    setEditingId(item.cylinder_id);
    setFormData({
      serial_number: item.serial_number || "",
      brand: item.brand || "",
      gas_type: item.gas_type || "",
      size: item.size || "",
      manufacture_date: item.manufacture_date || "",
      expiry_date: item.expiry_date || "",
      last_check_date: item.last_check_date || "",
      next_check_date: item.next_check_date || "",
      delivered_date: item.delivered_date || "",
      current_location: item.current_location || "",
      status: item.status || "ในคลัง",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isOver3Years = (dateString) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return false;
    return (new Date() - d) / (1000 * 60 * 60 * 24) > 365 * 3;
  };

  const openDatePicker = (e) => {
    if (e.target.showPicker) {
      try {
        e.target.showPicker();
      } catch (err) {
        console.error(err);
      }
    }
  };

  // ---------- Filter ----------
  const filteredCylinders = cylinders.filter((item) => {
    const term = searchTerm.toLowerCase().trim();
    const fields = [
      item.serial_number,
      item.cylinder_id,
      item.brand,
      item.gas_type,
      item.size,
      item.manufacture_date,
      item.expiry_date,
      item.next_check_date,
      item.current_location,
      item.status,
    ]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());
    const isInStock = (item.status || "").trim() === "ในคลัง";
    return isInStock && fields.some((f) => f.includes(term));
  });

  const filteredDeliveries = deliveries
    .filter((item) => {
      const term = searchTerm.toLowerCase().trim();
      const fields = [
        item.delivery_id,
        item.serial_number,
        item.customer_name,
        item.address,
        item.brand,
        item.gas_type,
        item.size,
        item.status,
        item.created_at,
        item.delivered_date,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      return fields.some((f) => f.includes(term));
    })
    .sort((a, b) => {
      const aLost = isOver3Years(a.created_at || a.delivered_date);
      const bLost = isOver3Years(b.created_at || b.delivered_date);
      if (aLost && !bLost) return 1;
      if (!aLost && bLost) return -1;
      return 0;
    });

  // ====================================================
  // CRUD: Cylinder
  // ====================================================
  const handleSave = (e) => {
    if (e) e.preventDefault();

    if (!formData.serial_number.trim())
      return alert("กรุณากรอก Serial Number");
    if (!formData.brand) return alert("กรุณาเลือก ยี่ห้อ");
    if (!formData.gas_type) return alert("กรุณาเลือก ชนิดแก๊ส");
    if (!formData.size) return alert("กรุณาเลือก ขนาดถัง");
    if (!formData.manufacture_date) return alert("กรุณาเลือก วันที่ผลิต");
    if (!formData.status) return alert("กรุณาเลือก สถานะเริ่มต้น");

    const payload = {
      serial_number: formData.serial_number.trim(),
      brand: formData.brand,
      gas_type: formData.gas_type,
      size: formData.size,
      manufacture_date: formData.manufacture_date || null,
      expiry_date: formData.expiry_date || null,
      last_check_date: formData.last_check_date || null,
      next_check_date: formData.next_check_date || null,
      delivered_date: formData.delivered_date || null,
      current_location: formData.current_location || "",
      status: formData.status,
    };

    setIsSubmitting(true);
    try {
      if (editingId) {
        updateDb((draft) => {
          const list = draft.tables.gas_cylinder;
          const idx = list.findIndex((c) => c.cylinder_id === editingId);
          if (idx >= 0) {
            list[idx] = {
              ...list[idx],
              ...payload,
              updated_at: new Date().toISOString(),
            };
          }
        });
      } else {
        const dup = cylinders.some(
          (c) => c.serial_number === payload.serial_number
        );
        if (dup) {
          alert("Serial Number นี้มีอยู่ในระบบแล้ว");
          setIsSubmitting(false);
          return;
        }
        updateDb((draft) => {
          const list = draft.tables.gas_cylinder;
          list.push({
            cylinder_id: genCylinderId(list),
            ...payload,
            qr_code: null,
            assigned_to: null,
            assigned_date: null,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        });
      }
      clearForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCylinder = (cylinderId) => {
    if (!cylinderId) return;
    const target = cylinders.find((c) => c.cylinder_id === cylinderId);
    if (
      !window.confirm(
        `ต้องการลบถังแก๊ส ${target?.serial_number || cylinderId} ใช่หรือไม่?`
      )
    )
      return;

    updateDb((draft) => {
      draft.tables.gas_cylinder = (draft.tables.gas_cylinder || []).filter(
        (c) => c.cylinder_id !== cylinderId
      );
    });
  };

  const handleDeleteDelivery = (deliveryId) => {
    if (!deliveryId) return;
    if (!window.confirm(`ต้องการลบรายการจัดส่ง #${deliveryId} ใช่หรือไม่?`))
      return;
    updateDb((draft) => {
      draft.tables.delivery = (draft.tables.delivery || []).filter(
        (d) => d.delivery_id !== deliveryId
      );
    });
  };

  // ====================================================
  // Options management
  // ====================================================
  const optionKeyFromType = (type) => {
    if (type === "brand") return "brands";
    if (type === "gas_type" || type === "gasType") return "gas_types";
    if (type === "size") return "sizes";
    if (type === "location") return "locations";
    return null;
  };

  const openOptionModal = (type, title) => {
    setManageModal({ open: true, type, title });
    setNewItemText("");
  };

  const getModalItems = () => {
    const key = optionKeyFromType(manageModal.type);
    if (!key) return [];
    return options?.[key] || [];
  };

  const handleAddItem = () => {
    const value = newItemText.trim();
    if (!value) return;
    const key = optionKeyFromType(manageModal.type);
    if (!key) return;
    updateOptions((draft) => {
      if (!Array.isArray(draft[key])) draft[key] = [];
      if (!draft[key].includes(value)) draft[key].push(value);
    });
    setNewItemText("");
  };

  const handleRemoveItem = (value) => {
    if (!window.confirm(`ต้องการลบ "${value}" ใช่หรือไม่?`)) return;
    const key = optionKeyFromType(manageModal.type);
    if (!key) return;
    updateOptions((draft) => {
      draft[key] = (draft[key] || []).filter((v) => v !== value);
    });
  };

  // ====================================================
  // Modal helpers
  // ====================================================
  const handleShowQR = (item) => {
    let full = { ...item };
    if (item.serial_number) {
      const found = cylinders.find(
        (c) => c.serial_number === item.serial_number
      );
      if (found) full = { ...found, ...item };
    }
    setQrModal({ open: true, cylinder: full });
  };

  const getProofImageUrl = (proofImg) => {
    if (!proofImg) return "";
    if (proofImg.startsWith("http://") || proofImg.startsWith("https://"))
      return proofImg;
    const clean = proofImg.replace(/^\/+/, "");
    if (clean.startsWith("Backend/")) return `/${clean}`;
    return `/Backend/uploads/${clean}`;
  };

  const handleShowImage = (rawPath, serialOrId) => {
    if (!rawPath) return;
    setImageModal({
      open: true,
      imgSrc: getProofImageUrl(rawPath),
      rawPath,
      serial: serialOrId,
    });
  };

  const currentModalItems = getModalItems();
  const selectedCylinder = qrModal.cylinder;

  // ---------- Sync status label ----------
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
        <h1 style={{ color: "white", margin: 0 }}>จัดการถังแก๊ส</h1>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: apiAvailable ? "#22c55e" : "#f59e0b",
              fontSize: "12px",
            }}
          >
            {syncLabel()}
          </span>

          {apiAvailable && (
            <button
              type="button"
              onClick={handleReloadFromFile}
              style={{ ...secondaryButtonStyle, background: "#0ea5e9" }}
              title="โหลดข้อมูลจาก Data.json ใหม่"
            >
              🔄 โหลดจากไฟล์
            </button>
          )}

          <button
            type="button"
            onClick={handleManualSave}
            style={primaryButtonStyle}
          >
            💾 บันทึกทันที
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            style={secondaryButtonStyle}
          >
            📥 นำเข้า JSON
          </button>
          <button
            type="button"
            onClick={() => downloadJson(db, "Data.json")}
            style={secondaryButtonStyle}
          >
            📤 ดาวน์โหลด
          </button>
        </div>
      </div>

      {/* คำอธิบาย */}
      <div
        style={{
          background: apiAvailable ? "#0c4a6e" : "#7c2d12",
          border: `1px solid ${apiAvailable ? "#0284c7" : "#ef4444"}`,
          color: "#e0f2fe",
          padding: "10px 14px",
          borderRadius: "8px",
          fontSize: "13px",
          marginBottom: "16px",
        }}
      >
        💡 <b>การใช้งาน:</b>{" "}
        {apiAvailable ? (
          <>
            ทุกครั้งที่เพิ่ม/ลบ/แก้ไข ระบบจะเขียนลงไฟล์จริง
            ให้ <b>ทันที</b> แบบ realtime
            (ไม่ต้องกดบันทึกเอง)
          </>
        ) : (
          <>
            ไม่พบ API <code>/api/data</code> — กรุณารันผ่าน{" "}
            <code>npm run dev</code> (Vite) และตรวจสอบว่าได้วางไฟล์{" "}
            <code>vite.config.js</code> แล้ว ระบบจะ fallback ไปใช้ localStorage
            ชั่วคราว
          </>
        )}
      </div>

      {/* ฟอร์ม */}
      <form onSubmit={handleSave} style={formCardStyle}>
        <div style={formGridStyle}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Serial Number *</label>
            <input
              type="text"
              value={formData.serial_number}
              onChange={(e) =>
                setFormData({ ...formData, serial_number: e.target.value })
              }
              style={inputStyle}
              placeholder="SN-001"
              disabled={!!editingId}
              required
            />
          </div>

          <div style={fieldGroupStyle}>
            <div style={flexBetweenStyle}>
              <label style={labelStyle}>ยี่ห้อ *</label>
              <button
                type="button"
                onClick={() => openOptionModal("brand", "จัดการรายการยี่ห้อ")}
                style={manageBtnStyle}
              >
                ⚙️ จัดการ
              </button>
            </div>
            <select
              value={formData.brand}
              onChange={(e) =>
                setFormData({ ...formData, brand: e.target.value })
              }
              style={inputStyle}
              required
            >
              <option value="">-- เลือกยี่ห้อ --</option>
              {(options?.brands || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldGroupStyle}>
            <div style={flexBetweenStyle}>
              <label style={labelStyle}>ชนิดแก๊ส *</label>
              <button
                type="button"
                onClick={() =>
                  openOptionModal("gas_type", "จัดการรายการชนิดแก๊ส")
                }
                style={manageBtnStyle}
              >
                ⚙️ จัดการ
              </button>
            </div>
            <select
              value={formData.gas_type}
              onChange={(e) =>
                setFormData({ ...formData, gas_type: e.target.value })
              }
              style={inputStyle}
              required
            >
              <option value="">-- เลือกชนิด --</option>
              {(options?.gas_types || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldGroupStyle}>
            <div style={flexBetweenStyle}>
              <label style={labelStyle}>ขนาดถัง *</label>
              <button
                type="button"
                onClick={() => openOptionModal("size", "จัดการรายการขนาดถัง")}
                style={manageBtnStyle}
              >
                ⚙️ จัดการ
              </button>
            </div>
            <select
              value={formData.size}
              onChange={(e) =>
                setFormData({ ...formData, size: e.target.value })
              }
              style={inputStyle}
              required
            >
              <option value="">-- เลือกขนาด --</option>
              {(options?.sizes || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>วันที่ผลิต *</label>
            <input
              type="date"
              value={formData.manufacture_date}
              onClick={openDatePicker}
              onChange={handleManufactureDateChange}
              style={inputStyle}
              required
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>วันหมดอายุ (+10 ปี)</label>
            <input
              type="date"
              value={formData.expiry_date}
              readOnly
              style={{
                ...inputStyle,
                backgroundColor: "#1f2937",
                cursor: "not-allowed",
              }}
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>วันที่ตรวจล่าสุด</label>
            <input
              type="date"
              value={formData.last_check_date}
              onClick={openDatePicker}
              onChange={handleLastCheckDateChange}
              style={inputStyle}
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>วันตรวจถัดไป (+5 ปี)</label>
            <input
              type="date"
              value={formData.next_check_date}
              readOnly
              style={{
                ...inputStyle,
                backgroundColor: "#1f2937",
                cursor: "not-allowed",
              }}
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>วันที่ส่งมอบให้ลูกค้า</label>
            <input
              type="date"
              value={formData.delivered_date}
              onClick={openDatePicker}
              onChange={(e) =>
                setFormData({ ...formData, delivered_date: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <div style={fieldGroupStyle}>
            <div style={flexBetweenStyle}>
              <label style={labelStyle}>สถานที่ปัจจุบัน</label>
              <button
                type="button"
                onClick={() =>
                  openOptionModal("location", "จัดการรายการสถานที่")
                }
                style={manageBtnStyle}
              >
                ⚙️ จัดการ
              </button>
            </div>
            <select
              value={formData.current_location}
              onChange={(e) =>
                setFormData({ ...formData, current_location: e.target.value })
              }
              style={inputStyle}
            >
              <option value="">-- เลือกสถานที่ --</option>
              {(options?.locations || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>สถานะเริ่มต้น *</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
              style={inputStyle}
              required
            >
              <option value="ในคลัง">ในคลัง</option>
              <option value="ปกติ">ปกติ</option>
              <option value="pending">pending (กำลังจัดส่ง)</option>
              <option value="success">success (จัดส่งสำเร็จ)</option>
              <option value="ชำรุด">ชำรุด</option>
            </select>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "15px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="submit"
            style={primaryButtonStyle}
            disabled={isSubmitting}
          >
            {isSubmitting ? "กำลังบันทึก..." : editingId ? "บันทึก" : "เพิ่ม"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={clearForm}
              style={secondaryButtonStyle}
            >
              ยกเลิก
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (
                !window.confirm(
                  "รีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้นจาก Data.json ใช่หรือไม่?"
                )
              )
                return;
              try {
                const fresh = await fetchFileDb();
                const norm = normalizeDb(fresh);
                setDb(norm);
                setOptions(deriveOptions(norm.tables.gas_cylinder));
              } catch (err) {
                alert("โหลดข้อมูลเริ่มต้นไม่สำเร็จ: " + err.message);
              }
            }}
            style={{ ...secondaryButtonStyle, background: "#7c2d12" }}
          >
            🔄 Reset จากไฟล์
          </button>
        </div>
      </form>

      {/* Modal Options */}
      {manageModal.open && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ marginTop: 0, color: "white" }}>
              {manageModal.title}
            </h3>
            <div style={{ display: "flex", gap: "8px", marginBottom: "15px" }}>
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="กรอกรายการใหม่..."
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddItem}
                style={primaryButtonStyle}
              >
                เพิ่ม
              </button>
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 15px 0",
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              {currentModalItems.length > 0 ? (
                currentModalItems.map((v) => (
                  <li key={v} style={modalListItemStyle}>
                    <span style={{ color: "white" }}>{v}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(v)}
                      style={deleteButtonStyle}
                    >
                      ลบ
                    </button>
                  </li>
                ))
              ) : (
                <li
                  style={{
                    color: "#9ca3af",
                    textAlign: "center",
                    padding: "10px 0",
                  }}
                >
                  ยังไม่มีรายการ
                </li>
              )}
            </ul>
            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                onClick={() =>
                  setManageModal({ open: false, type: "", title: "" })
                }
                style={secondaryButtonStyle}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {qrModal.open && (
        <div
          style={modalOverlayStyle}
          onClick={() => setQrModal({ open: false, cylinder: null })}
        >
          <div
            style={{ ...modalContentStyle, textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: "white" }}>
              QR Code สำหรับสแกน
            </h3>
            {selectedCylinder?.serial_number && (
              <p
                style={{
                  margin: "4px 0",
                  color: "#94a3b8",
                  fontWeight: "bold",
                }}
              >
                Serial: {selectedCylinder.serial_number}
              </p>
            )}
            <div
              style={{
                background: "white",
                padding: "16px",
                borderRadius: "12px",
                display: "inline-block",
                margin: "16px 0",
              }}
            >
              <QRCodeSVG
                value={getQrUrl(selectedCylinder)}
                size={200}
                includeMargin
              />
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "#64748b",
                wordBreak: "break-all",
                margin: "4px 0",
              }}
            >
              URL: {getQrUrl(selectedCylinder)}
            </p>
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "center",
                marginTop: "16px",
              }}
            >
              <button
                type="button"
                onClick={() => window.print()}
                style={primaryButtonStyle}
              >
                🖨️ พิมพ์ QR Code
              </button>
              <button
                type="button"
                onClick={() => setQrModal({ open: false, cylinder: null })}
                style={secondaryButtonStyle}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal รูป */}
      {imageModal.open && (
        <div
          style={modalOverlayStyle}
          onClick={() =>
            setImageModal({ open: false, imgSrc: "", rawPath: "", serial: "" })
          }
        >
          <div
            style={{
              ...modalContentStyle,
              width: "auto",
              maxWidth: "90vw",
              textAlign: "center",
              background: "#111827",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: "white" }}>
              หลักฐานการจัดส่ง ({imageModal.serial})
            </h3>
            <img
              src={imageModal.imgSrc}
              alt="Proof"
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                borderRadius: "8px",
                objectFit: "contain",
              }}
              onError={(e) => {
                e.target.onerror = null;
                const fileName = imageModal.rawPath
                  ? imageModal.rawPath.split("/").pop()
                  : "";
                if (fileName) e.target.src = `/Backend/uploads/${fileName}`;
              }}
            />
            <div style={{ marginTop: "15px", textAlign: "center" }}>
              <button
                type="button"
                onClick={() =>
                  setImageModal({
                    open: false,
                    imgSrc: "",
                    rawPath: "",
                    serial: "",
                  })
                }
                style={secondaryButtonStyle}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ค้นหา */}
      <div style={{ marginBottom: "20px", width: "100%" }}>
        <input
          type="text"
          placeholder="ค้นหา Serial Number, Delivery ID, ยี่ห้อ, ลูกค้า, สถานที่..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            ...inputStyle,
            width: "100%",
            padding: "10px 14px",
            borderColor: "#3b82f6",
          }}
        />
      </div>

      {/* ตารางที่ 1 */}
      <div style={{ marginBottom: "30px", overflowX: "auto" }}>
        <h3
          style={{
            color: "#38bdf8",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          รายการถังแก๊สในคลัง / ทั่วไป ({filteredCylinders.length})
        </h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Cylinder ID</th>
              <th style={thStyle}>Serial Number</th>
              <th style={thStyle}>ยี่ห้อ</th>
              <th style={thStyle}>ชนิด</th>
              <th style={thStyle}>ขนาด</th>
              <th style={thStyle}>วันที่ผลิต</th>
              <th style={thStyle}>วันหมดอายุ</th>
              <th style={thStyle}>วันตรวจถัดไป</th>
              <th style={thStyle}>สถานะ</th>
              <th style={thStyle}>สถานที่</th>
              <th style={{ ...thStyle, textAlign: "center" }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredCylinders.length > 0 ? (
              filteredCylinders.map((item) => (
                <tr key={item.cylinder_id}>
                  <td
                    style={{
                      ...tdStyle,
                      color: "#f59e0b",
                      fontWeight: "bold",
                    }}
                  >
                    {item.cylinder_id}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      color: "#38bdf8",
                      fontWeight: "bold",
                    }}
                  >
                    {item.serial_number || "-"}
                  </td>
                  <td style={tdStyle}>{item.brand || "-"}</td>
                  <td style={tdStyle}>{item.gas_type || "-"}</td>
                  <td style={tdStyle}>{item.size || "-"}</td>
                  <td style={tdStyle}>{item.manufacture_date || "-"}</td>
                  <td style={tdStyle}>{item.expiry_date || "-"}</td>
                  <td style={tdStyle}>{item.next_check_date || "-"}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle("#3b82f6")}>
                      {item.status || "-"}
                    </span>
                  </td>
                  <td style={tdStyle}>{item.current_location || "-"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div style={rowActionsStyle}>
                      <button
                        type="button"
                        onClick={() => handleShowQR(item)}
                        style={qrButtonStyle}
                      >
                        QR
                      </button>
                      <button
                        type="button"
                        onClick={() => editCylinder(item)}
                        style={editButtonStyle}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCylinder(item.cylinder_id)}
                        style={deleteButtonStyle}
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="11"
                  style={{
                    ...tdStyle,
                    textAlign: "center",
                    color: "#9ca3af",
                    padding: "20px",
                  }}
                >
                  ไม่พบข้อมูลถังแก๊สในคลัง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ตารางที่ 2 */}
      <div style={{ overflowX: "auto" }}>
        <h3
          style={{
            color: "#22c55e",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          รายการถังแก๊สที่กำลังจัดส่ง/จัดส่งสำเร็จ (
          {filteredDeliveries.length})
        </h3>
        <table style={tableStyle}>
          <thead>
            <tr style={{ backgroundColor: "#064e3b" }}>
              <th style={{ ...thStyle, backgroundColor: "#064e3b" }}>
                Delivery ID
              </th>
              <th style={{ ...thStyle, backgroundColor: "#064e3b" }}>
                Serial Number
              </th>
              <th style={{ ...thStyle, backgroundColor: "#064e3b" }}>
                ลูกค้า / สถานที่
              </th>
              <th style={{ ...thStyle, backgroundColor: "#064e3b" }}>
                ยี่ห้อ
              </th>
              <th style={{ ...thStyle, backgroundColor: "#064e3b" }}>ชนิด</th>
              <th style={{ ...thStyle, backgroundColor: "#064e3b" }}>ขนาด</th>
              <th style={{ ...thStyle, backgroundColor: "#064e3b" }}>
                สถานะ
              </th>
              <th style={{ ...thStyle, backgroundColor: "#064e3b" }}>
                วันที่จัดส่ง
              </th>
              <th
                style={{
                  ...thStyle,
                  backgroundColor: "#064e3b",
                  textAlign: "center",
                }}
              >
                หลักฐาน
              </th>
              <th
                style={{
                  ...thStyle,
                  backgroundColor: "#064e3b",
                  textAlign: "center",
                }}
              >
                จัดการ
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredDeliveries.length > 0 ? (
              filteredDeliveries.map((item) => {
                const proofImg =
                  item.proof_image_path || item.proof_image || "";
                const deliveryDate = item.created_at || item.delivered_date;
                const isLost = isOver3Years(deliveryDate);
                const rawStatus = (item.status || "").trim().toLowerCase();

                return (
                  <tr
                    key={item.delivery_id}
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
                      #{item.delivery_id || "-"}
                    </td>
                    <td style={tdStyle}>
                      {item.serial_number ? (
                        <span
                          style={{ color: "#38bdf8", fontWeight: "bold" }}
                        >
                          {item.serial_number}
                        </span>
                      ) : (
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
                      <div>{item.customer_name || "-"}</div>
                      <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                        {item.address || "-"}
                      </div>
                    </td>
                    <td style={tdStyle}>{item.brand || "-"}</td>
                    <td style={tdStyle}>{item.gas_type || "-"}</td>
                    <td style={tdStyle}>{item.size || "-"}</td>
                    <td style={tdStyle}>
                      {isLost ? (
                        <span style={badgeStyle("#ef4444")}>สูญหาย</span>
                      ) : rawStatus === "success" ? (
                        <span style={badgeStyle("#22c55e")}>จัดส่งสำเร็จ</span>
                      ) : rawStatus === "pending" ? (
                        <span style={badgeStyle("#f59e0b")}>กำลังจัดส่ง</span>
                      ) : (
                        <span style={badgeStyle("#6b7280")}>
                          {item.status || "-"}
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: "#38bdf8",
                        fontSize: "12px",
                      }}
                    >
                      {deliveryDate || "-"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {proofImg ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleShowImage(proofImg, item.delivery_id)
                          }
                          style={viewImageButtonStyle}
                        >
                          📷 ดูรูป
                        </button>
                      ) : (
                        <span style={{ color: "#6b7280", fontSize: "12px" }}>
                          ไม่มีรูป
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={rowActionsStyle}>
                        <button
                          type="button"
                          onClick={() => handleShowQR(item)}
                          style={qrButtonStyle}
                        >
                          QR
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDelivery(item.delivery_id)}
                          style={deleteButtonStyle}
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan="10"
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
// Styles
// ====================================================
const flexBetweenStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const rowActionsStyle = { display: "inline-flex", gap: "4px" };
const formCardStyle = {
  background: "#1f2937",
  padding: "20px",
  borderRadius: "12px",
  marginBottom: "20px",
};
const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};
const fieldGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};
const labelStyle = { fontSize: "13px", color: "#e5e7eb" };
const inputStyle = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  width: "100%",
  boxSizing: "border-box",
  fontSize: "13px",
};
const manageBtnStyle = {
  background: "none",
  border: "none",
  color: "#60a5fa",
  fontSize: "11px",
  cursor: "pointer",
  padding: 0,
};
const primaryButtonStyle = {
  padding: "8px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};
const secondaryButtonStyle = {
  padding: "8px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#6b7280",
  color: "white",
  cursor: "pointer",
};
const viewImageButtonStyle = {
  padding: "4px 10px",
  border: "1px solid #3b82f6",
  borderRadius: "6px",
  background: "#1e3a8a",
  color: "#60a5fa",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: "500",
};
const qrButtonStyle = {
  padding: "4px 8px",
  border: "none",
  borderRadius: "4px",
  background: "#10b981",
  color: "white",
  cursor: "pointer",
  fontSize: "12px",
};
const editButtonStyle = {
  padding: "4px 8px",
  border: "none",
  borderRadius: "4px",
  background: "#f59e0b",
  color: "white",
  cursor: "pointer",
  fontSize: "12px",
};
const deleteButtonStyle = {
  padding: "4px 8px",
  border: "none",
  borderRadius: "4px",
  background: "#ef4444",
  color: "white",
  cursor: "pointer",
  fontSize: "12px",
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
const modalOverlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};
const modalContentStyle = {
  background: "#1f2937",
  padding: "20px",
  borderRadius: "12px",
  width: "350px",
  boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
};
const modalListItemStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 0",
  borderBottom: "1px solid #374151",
};
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

export default GasPage;
