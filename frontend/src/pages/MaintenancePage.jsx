import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Layout from "../components/Layout";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
// ====================================================
const DB_KEY = "gas_system_db_v1";
const OPT_KEY = "gas_system_options_v1";
const MAINT_OPT_KEY = "gas_system_maintenance_options_v1";
const API_URL = "/api/data";

const clone = (obj) => JSON.parse(JSON.stringify(obj));

const emptyDb = () => ({
  tables: {
    gas_cylinder: [],
    delivery: [],
    customer: [],
    delivery_staff: [],
    maintenance: [],
  },
});

const normalizeDb = (d) => {
  const out = d && typeof d === "object" ? d : emptyDb();
  if (!out.tables) out.tables = {};
  if (!Array.isArray(out.tables.gas_cylinder)) out.tables.gas_cylinder = [];
  if (!Array.isArray(out.tables.delivery)) out.tables.delivery = [];
  if (!Array.isArray(out.tables.customer)) out.tables.customer = [];
  if (!Array.isArray(out.tables.delivery_staff)) out.tables.delivery_staff = [];
  if (!Array.isArray(out.tables.maintenance)) out.tables.maintenance = [];
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

const loadLocalJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
};
const saveLocalJson = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
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

const genMaintenanceId = (list) => {
  const nums = list
    .map((m) =>
      parseInt(String(m.maintenance_id || "").replace(/\D/g, ""), 10)
    )
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `MNT${String(next).padStart(3, "0")}`;
};

// ====================================================
// Component
// ====================================================
function MaintenancePage() {
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle");

  const loadedDbRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const saveInFlightRef = useRef(false);

  // --- Bulk Selection ---
  const [selectedSerialNumbers, setSelectedSerialNumbers] = useState([]);

  // --- Dynamic Option Lists (maintenance-specific) ---
  const defaultMaintOptions = {
    typeOptions: ["ตรวจสภาพ", "บำรุงรักษา", "ซ่อมแซม"],
    resultOptions: ["ผ่าน", "ไม่ผ่าน", "รอผลตรวจ"],
    actionOptions: [
      "ใช้งานต่อได้ (ปกติ)",
      "สมควรบำรุงรักษาต่อ",
      "ส่งซ่อมแซมด่วน",
      "ส่งทดสอบ Hydrostatic",
      "ปลดตระกูล / จำหน่ายออก",
    ],
    noteOptions: [
      "สภาพสมบูรณ์ พร้อมใช้งาน",
      "วาล์วชำรุด สมควรเปลี่ยนวาล์ว",
      "ตัวถังมีรอยบุบ/สนิม ต้องบำรุงรักษา",
      "ส่งทดสอบแรงดันน้ำ (Hydrostatic Test)",
      "หมดอายุการใช้งาน สมควรคัดทิ้ง",
    ],
  };

  const [maintOptions, setMaintOptions] = useState(defaultMaintOptions);
  const [typeOptions, setTypeOptions] = useState(defaultMaintOptions.typeOptions);
  const [resultOptions, setResultOptions] = useState(defaultMaintOptions.resultOptions);
  const [actionOptions, setActionOptions] = useState(defaultMaintOptions.actionOptions);
  const [noteOptions, setNoteOptions] = useState(defaultMaintOptions.noteOptions);

  // --- Form State ---
  const [selectedSerialNumber, setSelectedSerialNumber] = useState("");
  const [maintenanceType, setMaintenanceType] = useState("");
  const [result, setResult] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [selectedNote, setSelectedNote] = useState("");
  const [description, setDescription] = useState("");

  // --- Search ---
  const [dueSearchTerm, setDueSearchTerm] = useState("");
  const [historySearchTerm, setHistorySearchTerm] = useState("");

  // --- Modals ---
  const [activeModal, setActiveModal] = useState(null);
  const [newItemInput, setNewItemInput] = useState("");

  // --- Edit Modal ---
  const [editingItem, setEditingItem] = useState(null);
  const [editSerial, setEditSerial] = useState("");
  const [editType, setEditType] = useState("");
  const [editResult, setEditResult] = useState("");
  const [editNextAction, setEditNextAction] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const todayStr = new Date().toISOString().split("T")[0];
  const todayDate = useMemo(() => new Date(todayStr), [todayStr]);

  const parseLocalDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return null;
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  // ====================================================
  // Load on mount
  // ====================================================
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

  // ---------- Load maintenance options from localStorage ----------
  useEffect(() => {
    const saved = loadLocalJson(MAINT_OPT_KEY);
    if (saved) {
      const merged = {
        typeOptions: saved.typeOptions || defaultMaintOptions.typeOptions,
        resultOptions: saved.resultOptions || defaultMaintOptions.resultOptions,
        actionOptions: saved.actionOptions || defaultMaintOptions.actionOptions,
        noteOptions: saved.noteOptions || defaultMaintOptions.noteOptions,
      };
      setMaintOptions(merged);
      setTypeOptions(merged.typeOptions);
      setResultOptions(merged.resultOptions);
      setActionOptions(merged.actionOptions);
      setNoteOptions(merged.noteOptions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist maintenance options
  useEffect(() => {
    saveLocalJson(MAINT_OPT_KEY, {
      typeOptions,
      resultOptions,
      actionOptions,
      noteOptions,
    });
  }, [typeOptions, resultOptions, actionOptions, noteOptions]);

  // ---------- Persist db to localStorage ----------
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
  const allCylinders = tables.gas_cylinder || [];
  const maintenances = tables.maintenance || [];

  const calculateNextCheckDate = (item) => {
    if (item.next_check_date) return item.next_check_date;
    if (item.next_maintenance_date) return item.next_maintenance_date;
    if (item.maintenance_date) {
      const d = new Date(item.maintenance_date);
      if (!isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() + 5);
        return d.toISOString().split("T")[0];
      }
    }
    return "-";
  };

  const dueCylinders = useMemo(() => {
    if (!Array.isArray(allCylinders)) return [];
    return allCylinders.filter((item) => {
      if (!item || !item.next_check_date) return false;
      const dueDate = parseLocalDate(item.next_check_date);
      return dueDate && dueDate <= todayDate;
    });
  }, [allCylinders, todayDate]);

  const getDueStatus = (nextCheckDateStr) => {
    if (!nextCheckDateStr) return "ไม่มีกำหนด";
    const dueDate = parseLocalDate(nextCheckDateStr);
    if (!dueDate) return "รูปแบบผิด";
    if (dueDate < todayDate) return "เลยกำหนด";
    if (dueDate.getTime() === todayDate.getTime()) return "ถึงกำหนดวันนี้";
    return "ใกล้ถึงกำหนด";
  };

  const filteredDueCylinders = useMemo(() => {
    if (!Array.isArray(dueCylinders)) return [];
    return dueCylinders.filter((item) => {
      if (!item) return false;
      const statusText = getDueStatus(item.next_check_date);
      const searchText = [
        item.serial_number,
        item.brand,
        item.size,
        item.next_check_date,
        statusText,
        item.status,
      ]
        .filter((val) => val !== null && val !== undefined)
        .map((val) => String(val))
        .join(" ")
        .toLowerCase();

      return searchText.includes((dueSearchTerm || "").toLowerCase());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueCylinders, dueSearchTerm]);

  const filteredMaintenances = useMemo(() => {
    if (!Array.isArray(maintenances)) return [];
    return [...maintenances]
      .sort((a, b) => {
        const ta = new Date(a.maintenance_date || a.created_at || 0).getTime();
        const tb = new Date(b.maintenance_date || b.created_at || 0).getTime();
        return tb - ta;
      })
      .filter((item) => {
        if (!item) return false;
        const searchText = [
          item.maintenance_id,
          item.serial_number || item.cylinder_id,
          item.maintenance_date,
          item.maintenance_type,
          item.result,
          item.next_action,
          item.next_check_date || item.next_maintenance_date,
          item.description,
        ]
          .filter((val) => val !== null && val !== undefined)
          .map((val) => String(val))
          .join(" ")
          .toLowerCase();

        return searchText.includes((historySearchTerm || "").toLowerCase());
      });
  }, [maintenances, historySearchTerm]);

  // ====================================================
  // Selection
  // ====================================================
  const handleToggleSelect = (serialNumber) => {
    setSelectedSerialNumbers((prev) =>
      prev.includes(serialNumber)
        ? prev.filter((sn) => sn !== serialNumber)
        : [...prev, serialNumber]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allFilteredSerials = filteredDueCylinders.map((c) => c.serial_number);
      setSelectedSerialNumbers(allFilteredSerials);
    } else {
      setSelectedSerialNumbers([]);
    }
  };

  // ====================================================
  // Save maintenance
  // ====================================================
  const saveMaintenance = () => {
    const targetSerials =
      selectedSerialNumbers.length > 0
        ? selectedSerialNumbers
        : selectedSerialNumber
        ? [selectedSerialNumber]
        : [];

    if (targetSerials.length === 0) {
      alert("กรุณาเลือกถังแก๊สอย่างน้อย 1 รายการ");
      return;
    }
    if (!maintenanceType || !result) {
      alert("กรุณาเลือกประเภทการตรวจ และผลการตรวจ");
      return;
    }

    const fullDescription = [
      nextAction ? `[สิ่งที่ต้องทำต่อ: ${nextAction}]` : "",
      selectedNote ? `[หมายเหตุ: ${selectedNote}]` : "",
      description,
    ]
      .filter(Boolean)
      .join(" ");

    const today = new Date().toISOString().split("T")[0];
    const nextCheckDate = (() => {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() + 5);
      return d.toISOString().split("T")[0];
    })();

    setSaving(true);
    try {
      updateDb((draft) => {
        const maintList = draft.tables.maintenance || [];
        const cylList = draft.tables.gas_cylinder || [];

        targetSerials.forEach((serial) => {
          // 1) เพิ่มประวัติการตรวจ
          maintList.push({
            maintenance_id: genMaintenanceId(maintList),
            serial_number: serial,
            maintenance_date: today,
            maintenance_type: maintenanceType,
            result: result,
            next_action: nextAction,
            description: fullDescription,
            next_check_date: nextCheckDate,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          // 2) อัปเดตถัง: last_check_date / next_check_date / status
          const idx = cylList.findIndex(
            (c) => String(c.serial_number || "").trim() === serial
          );
          if (idx >= 0) {
            let newStatus = cylList[idx].status;
            if (result === "ไม่ผ่าน") newStatus = "ชำรุด";
            else if (result === "ผ่าน" && (newStatus || "").trim() !== "ชำรุด")
              newStatus = "ในคลัง";

            cylList[idx] = {
              ...cylList[idx],
              last_check_date: today,
              next_check_date: nextCheckDate,
              status: newStatus,
              updated_at: new Date().toISOString(),
            };
          }
        });

        draft.tables.maintenance = maintList;
        draft.tables.gas_cylinder = cylList;
      });

      alert(`บันทึกผลตรวจสำเร็จ ${targetSerials.length} รายการ`);
      setSelectedSerialNumber("");
      setSelectedSerialNumbers([]);
      setMaintenanceType("");
      setResult("");
      setNextAction("");
      setSelectedNote("");
      setDescription("");
    } finally {
      setSaving(false);
    }
  };

  // ====================================================
  // Edit maintenance
  // ====================================================
  const handleEditClick = (item) => {
    setEditingItem(item);
    setEditSerial(item.serial_number || item.cylinder_id || "");
    setEditType(item.maintenance_type || "");
    setEditResult(item.result || "");
    setEditNextAction(item.next_action || "");
    setEditDesc(item.description || "");
  };

  const handleUpdate = () => {
    if (!editSerial || !editType || !editResult) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    updateDb((draft) => {
      const list = draft.tables.maintenance || [];
      const idx = list.findIndex(
        (m) => m.maintenance_id === editingItem.maintenance_id
      );
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          serial_number: editSerial,
          maintenance_type: editType,
          result: editResult,
          next_action: editNextAction,
          description: editDesc,
          updated_at: new Date().toISOString(),
        };
      }
    });

    alert("แก้ไขประวัติสำเร็จ");
    setEditingItem(null);
  };

  // ====================================================
  // Modal options
  // ====================================================
  const getCurrentModalList = () => {
    if (activeModal === "type") return typeOptions;
    if (activeModal === "result") return resultOptions;
    if (activeModal === "action") return actionOptions;
    if (activeModal === "note") return noteOptions;
    return [];
  };

  const handleAddItem = () => {
    const text = newItemInput.trim();
    if (!text) return;
    const currentList = getCurrentModalList();
    if (currentList.includes(text)) {
      alert("มีตัวเลือกนี้อยู่แล้ว");
      return;
    }
    if (activeModal === "type") setTypeOptions([...typeOptions, text]);
    if (activeModal === "result") setResultOptions([...resultOptions, text]);
    if (activeModal === "action") setActionOptions([...actionOptions, text]);
    if (activeModal === "note") setNoteOptions([...noteOptions, text]);
    setNewItemInput("");
  };

  const handleRemoveItem = (indexToRemove) => {
    if (activeModal === "type")
      setTypeOptions(typeOptions.filter((_, i) => i !== indexToRemove));
    if (activeModal === "result")
      setResultOptions(resultOptions.filter((_, i) => i !== indexToRemove));
    if (activeModal === "action")
      setActionOptions(actionOptions.filter((_, i) => i !== indexToRemove));
    if (activeModal === "note")
      setNoteOptions(noteOptions.filter((_, i) => i !== indexToRemove));
  };

  const getModalTitle = () => {
    if (activeModal === "type") return "จัดการประเภทการตรวจ/บำรุง";
    if (activeModal === "result") return "จัดการผลการตรวจ";
    if (activeModal === "action") return "จัดการสิ่งที่ต้องทำต่อ";
    if (activeModal === "note") return "จัดการหมายเหตุสำเร็จรูป";
    return "";
  };

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
          marginBottom: "8px",
        }}
      >
        <h1 style={{ margin: 0, color: "white" }}>ตรวจสภาพและบำรุงรักษา</h1>
        <span
          style={{
            color: apiAvailable ? "#22c55e" : "#f59e0b",
            fontSize: "12px",
          }}
        >
          {syncLabel()}
        </span>
      </div>

      <div style={summaryRowStyle}>
        <div style={summaryCardStyle}>
          <h3>ถังที่ถึงกำหนดตรวจ</h3>
          <p style={summaryNumberStyle}>{dueCylinders.length}</p>
        </div>
        <div style={summaryCardStyle}>
          <h3>ประวัติการตรวจทั้งหมด</h3>
          <p style={summaryNumberStyle}>{maintenances.length}</p>
        </div>
      </div>

      <div style={formCardStyle}>
        <h2 style={{ marginTop: 0, color: "white" }}>
          บันทึกผลตรวจ{" "}
          {selectedSerialNumbers.length > 0 &&
            `(เลือกอยู่ ${selectedSerialNumbers.length} รายการ)`}
        </h2>
        <div style={formGridStyle}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              เลือกถังแบบเดี่ยว
              <br />
              (หรือติ๊กเลือกหลายรายการจากตารางด้านล่าง)
            </label>
            <div style={inputWithBtnStyle}>
              <select
                value={selectedSerialNumber}
                onChange={(e) => {
                  setSelectedSerialNumber(e.target.value);
                  if (e.target.value) setSelectedSerialNumbers([]);
                }}
                disabled={selectedSerialNumbers.length > 0}
                style={inputStyle}
              >
                <option value="">-- เลือกถังที่ถึงกำหนดตรวจ --</option>
                {dueCylinders.map((cyl) => (
                  <option key={cyl.serial_number} value={cyl.serial_number}>
                    {cyl.serial_number} - {cyl.brand || "LPG"} ({cyl.size}) [กำหนดตรวจ:{" "}
                    {cyl.next_check_date}]
                  </option>
                ))}
              </select>
              <div style={spacerStyle} />
            </div>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>ประเภทการตรวจ/บำรุง *</label>
            <div style={inputWithBtnStyle}>
              <select
                value={maintenanceType}
                onChange={(e) => setMaintenanceType(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- เลือกประเภท --</option>
                {typeOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setActiveModal("type")}
                style={iconButtonStyle}
                title="จัดการประเภท"
              >
                ⚙️
              </button>
            </div>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>ผลการตรวจ *</label>
            <div style={inputWithBtnStyle}>
              <select
                value={result}
                onChange={(e) => setResult(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- เลือกผลตรวจ --</option>
                {resultOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setActiveModal("result")}
                style={iconButtonStyle}
                title="จัดการผลตรวจ"
              >
                ⚙️
              </button>
            </div>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>สิ่งที่ต้องทำต่อ</label>
            <div style={inputWithBtnStyle}>
              <select
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- เลือกสิ่งที่ต้องทำต่อ --</option>
                {actionOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setActiveModal("action")}
                style={iconButtonStyle}
                title="จัดการสิ่งที่ต้องทำต่อ"
              >
                ⚙️
              </button>
            </div>
          </div>

          <div style={{ ...fieldGroupStyle, gridColumn: "1 / -1" }}>
            <label style={labelStyle}>เลือกหมายเหตุสำเร็จรูป</label>
            <div style={inputWithBtnStyle}>
              <select
                value={selectedNote}
                onChange={(e) => setSelectedNote(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- เลือกหมายเหตุประเมิน --</option>
                {noteOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setActiveModal("note")}
                style={iconButtonStyle}
                title="จัดการหมายเหตุ"
              >
                ⚙️
              </button>
            </div>
          </div>

          <div style={fieldGroupStyleFull}>
            <label style={labelStyle}>รายละเอียดเพิ่มเติม</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={textAreaStyle}
              placeholder="รายละเอียดการตรวจหรือข้อสังเกตเพิ่มเติม (ถ้ามี)"
              rows="3"
            />
          </div>
        </div>
        <button
          onClick={saveMaintenance}
          style={primaryButtonStyle}
          disabled={saving}
        >
          {saving
            ? "กำลังบันทึก..."
            : `บันทึกผลตรวจ ${
                selectedSerialNumbers.length > 0
                  ? `(${selectedSerialNumbers.length} รายการ)`
                  : ""
              }`}
        </button>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="🔍 ค้นหาถังที่ถึงกำหนดตรวจ..."
          value={dueSearchTerm}
          onChange={(e) => setDueSearchTerm(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      <div style={{ overflowX: "auto", marginBottom: "32px" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={
                    filteredDueCylinders.length > 0 &&
                    selectedSerialNumbers.length === filteredDueCylinders.length
                  }
                />
              </th>
              <th style={thStyle}>Serial Number</th>
              <th style={thStyle}>ยี่ห้อ</th>
              <th style={thStyle}>ขนาด</th>
              <th style={thStyle}>วันตรวจครั้งถัดไป</th>
              <th style={thStyle}>สถานะกำหนด</th>
              <th style={thStyle}>สถานะปัจจุบัน</th>
            </tr>
          </thead>
          <tbody>
            {filteredDueCylinders.length > 0 ? (
              filteredDueCylinders.map((item) => (
                <tr key={item.serial_number}>
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={selectedSerialNumbers.includes(
                        item.serial_number
                      )}
                      onChange={() => handleToggleSelect(item.serial_number)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <strong>{item.serial_number}</strong>
                  </td>
                  <td style={tdStyle}>{item.brand || "-"}</td>
                  <td style={tdStyle}>{item.size || "-"}</td>
                  <td style={tdStyle}>{item.next_check_date || "-"}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        ...badgeStyle,
                        ...(getDueStatus(item.next_check_date) === "เลยกำหนด"
                          ? overdueStyle
                          : getDueStatus(item.next_check_date) ===
                            "ถึงกำหนดวันนี้"
                          ? dueTodayStyle
                          : normalStyle),
                      }}
                    >
                      {getDueStatus(item.next_check_date)}
                    </span>
                  </td>
                  <td style={tdStyle}>{item.status || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td style={tdStyle} colSpan="7" align="center">
                  ไม่พบข้อมูลที่ค้นหาในถังที่ถึงกำหนดตรวจ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ color: "white", marginBottom: "16px" }}>
        ประวัติการตรวจล่าสุด
      </h2>

      <div style={{ marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="🔍 ค้นหาประวัติการตรวจ..."
          value={historySearchTerm}
          onChange={(e) => setHistorySearchTerm(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Serial Number</th>
              <th style={thStyle}>วันที่ตรวจ</th>
              <th style={thStyle}>ประเภท</th>
              <th style={thStyle}>ผลตรวจ</th>
              <th style={thStyle}>สิ่งที่ต้องทำต่อ</th>
              <th style={thStyle}>วันตรวจครั้งถัดไป</th>
              <th style={thStyle}>รายละเอียด/หมายเหตุ</th>
              <th style={thStyle}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredMaintenances.length > 0 ? (
              filteredMaintenances.map((item, index) => (
                <tr
                  key={
                    item.maintenance_id
                      ? `${item.maintenance_id}-${index}`
                      : index
                  }
                >
                  <td style={tdStyle}>{item.maintenance_id}</td>
                  <td style={tdStyle}>
                    <strong>{item.serial_number || item.cylinder_id || "-"}</strong>
                  </td>
                  <td style={tdStyle}>{item.maintenance_date || "-"}</td>
                  <td style={tdStyle}>{item.maintenance_type || "-"}</td>
                  <td style={tdStyle}>{item.result || "-"}</td>
                  <td style={tdStyle}>
                    <span style={actionBadgeStyle}>
                      {item.next_action || "-"}
                    </span>
                  </td>
                  <td style={tdStyle}>{calculateNextCheckDate(item)}</td>
                  <td style={tdStyle}>{item.description || "-"}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleEditClick(item)}
                      style={editButtonStyle}
                    >
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td style={tdStyle} colSpan="9" align="center">
                  ไม่พบข้อมูลที่ค้นหาในประวัติการตรวจ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal options */}
      {activeModal && (
        <div style={modalOverlayStyle}>
          <div style={darkModalStyle}>
            <div style={modalHeaderStyle}>
              <span style={{ fontWeight: "bold", fontSize: "16px" }}>
                ⚙️ {getModalTitle()}
              </span>
              <button
                onClick={() => setActiveModal(null)}
                style={closeModalIconStyle}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "16px",
                alignItems: "stretch",
              }}
            >
              <input
                type="text"
                placeholder="กรอกตัวเลือกใหม่..."
                value={newItemInput}
                onChange={(e) => setNewItemInput(e.target.value)}
                style={{ ...darkInputStyle, height: "42px" }}
              />
              <button
                onClick={handleAddItem}
                style={{ ...blueAddButtonStyle, height: "42px" }}
              >
                + เพิ่ม
              </button>
            </div>

            <div style={itemListContainerStyle}>
              {getCurrentModalList().map((item, idx) => (
                <div key={idx} style={itemCardStyle}>
                  <span style={{ fontSize: "14px", color: "#e5e7eb" }}>
                    {item}
                  </span>
                  <button
                    onClick={() => handleRemoveItem(idx)}
                    style={redDeleteButtonStyle}
                  >
                    ❌ ลบ
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal edit */}
      {editingItem && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ marginTop: 0 }}>
              ✏️ แก้ไขประวัติการตรวจ (ID: {editingItem.maintenance_id})
            </h3>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Serial Number</label>
              <input
                type="text"
                value={editSerial}
                onChange={(e) => setEditSerial(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ ...fieldGroupStyle, marginTop: "10px" }}>
              <label style={labelStyle}>ประเภทการตรวจ</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                style={inputStyle}
              >
                {typeOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ ...fieldGroupStyle, marginTop: "10px" }}>
              <label style={labelStyle}>ผลตรวจ</label>
              <select
                value={editResult}
                onChange={(e) => setEditResult(e.target.value)}
                style={inputStyle}
              >
                {resultOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ ...fieldGroupStyle, marginTop: "10px" }}>
              <label style={labelStyle}>สิ่งที่ต้องทำต่อ</label>
              <select
                value={editNextAction}
                onChange={(e) => setEditNextAction(e.target.value)}
                style={inputStyle}
              >
                {actionOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ ...fieldGroupStyle, marginTop: "10px" }}>
              <label style={labelStyle}>รายละเอียดเพิ่มเติม</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                style={textAreaStyle}
                rows="3"
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                marginTop: "15px",
              }}
            >
              <button
                onClick={() => setEditingItem(null)}
                style={cancelButtonStyle}
              >
                ยกเลิก
              </button>
              <button onClick={handleUpdate} style={primaryButtonStyle}>
                บันทึกแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ====================================================
// Styles
// ====================================================
const summaryRowStyle = {
  display: "flex",
  gap: "16px",
  flexWrap: "wrap",
  marginBottom: "20px",
};
const summaryCardStyle = {
  background: "#1f2937",
  color: "white",
  padding: "20px",
  borderRadius: "12px",
  minWidth: "220px",
  flex: "1",
};
const summaryNumberStyle = {
  fontSize: "28px",
  fontWeight: "bold",
  marginTop: "10px",
};
const formCardStyle = {
  background: "#111827",
  padding: "20px",
  borderRadius: "12px",
  marginBottom: "20px",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
  marginBottom: "16px",
};

const fieldGroupStyle = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  gap: "6px",
  width: "100%",
  boxSizing: "border-box",
};

const fieldGroupStyleFull = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  gridColumn: "1 / -1",
};

const labelStyle = {
  fontSize: "13px",
  fontWeight: "bold",
  color: "#e5e7eb",
  lineHeight: "1.3",
};

const inputStyle = {
  height: "42px",
  padding: "0 10px",
  borderRadius: "8px",
  border: "1px solid #4b5563",
  width: "100%",
  boxSizing: "border-box",
  backgroundColor: "#1f2937",
  color: "#fff",
  flex: 1,
};

const inputWithBtnStyle = {
  display: "flex",
  gap: "6px",
  alignItems: "center",
  width: "100%",
};

const iconButtonStyle = {
  width: "42px",
  height: "42px",
  background: "#374151",
  border: "1px solid #4b5563",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "14px",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const spacerStyle = { width: "42px", height: "42px", flexShrink: 0 };

const textAreaStyle = {
  minHeight: "80px",
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #4b5563",
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  fontFamily: "inherit",
  backgroundColor: "#1f2937",
  color: "#fff",
};
const searchInputStyle = {
  height: "42px",
  padding: "0 14px",
  borderRadius: "8px",
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  width: "100%",
  boxSizing: "border-box",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#1f2937",
  color: "white",
  borderRadius: "12px",
  overflow: "hidden",
};
const thStyle = {
  padding: "12px",
  textAlign: "left",
  borderBottom: "1px solid #374151",
  fontSize: "13px",
  whiteSpace: "nowrap",
};
const tdStyle = {
  padding: "12px",
  textAlign: "left",
  borderBottom: "1px solid #374151",
  fontSize: "13px",
};

const primaryButtonStyle = {
  height: "42px",
  padding: "0 16px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};
const cancelButtonStyle = {
  height: "42px",
  padding: "0 16px",
  border: "none",
  borderRadius: "8px",
  background: "#4b5563",
  color: "white",
  cursor: "pointer",
};
const editButtonStyle = {
  padding: "6px 10px",
  border: "none",
  borderRadius: "6px",
  background: "#f59e0b",
  color: "white",
  cursor: "pointer",
};

const badgeStyle = {
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "12px",
  fontWeight: "bold",
};
const overdueStyle = { background: "#ef4444", color: "white" };
const dueTodayStyle = { background: "#f59e0b", color: "black" };
const normalStyle = { background: "#10b981", color: "white" };
const actionBadgeStyle = {
  background: "#3b82f6",
  color: "white",
  padding: "3px 8px",
  borderRadius: "4px",
  fontSize: "12px",
};

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
const modalStyle = {
  background: "#1f2937",
  color: "white",
  padding: "24px",
  borderRadius: "12px",
  width: "90%",
  maxWidth: "500px",
};
const darkModalStyle = {
  background: "#1f2937",
  color: "white",
  padding: "20px",
  borderRadius: "12px",
  width: "90%",
  maxWidth: "400px",
  border: "1px solid #374151",
};
const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "16px",
};
const closeModalIconStyle = {
  background: "none",
  border: "none",
  color: "#9ca3af",
  fontSize: "18px",
  cursor: "pointer",
};
const darkInputStyle = {
  height: "42px",
  padding: "0 10px",
  borderRadius: "8px",
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  flex: 1,
  boxSizing: "border-box",
};
const blueAddButtonStyle = {
  height: "42px",
  padding: "0 14px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};
const itemListContainerStyle = {
  maxHeight: "250px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};
const itemCardStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 12px",
  background: "#111827",
  borderRadius: "8px",
};
const redDeleteButtonStyle = {
  padding: "4px 8px",
  border: "none",
  borderRadius: "6px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontSize: "12px",
};

export default MaintenancePage;