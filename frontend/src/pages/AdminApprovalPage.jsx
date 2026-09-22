import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Layout from "../components/Layout";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
//   - อ่าน/เขียนไฟล์จริงผ่าน Vite API  -> /api/data
//     (ตัว middleware จะเขียนลง src/pages/Data.json)
//   - เก็บสำเนาใน localStorage (offline fallback)
// ====================================================
const DB_KEY = "gas_system_db_v1";
const OPT_KEY = "gas_system_options_v1";
const API_URL = "/api/data";

const FONT_FAMILY = "'Kanit', 'Sarabun', sans-serif";

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

// ---------- Helpers ----------
const calculateDaysLeft = (targetDateStr) => {
  if (!targetDateStr) return null;
  const targetDate = new Date(targetDateStr);
  if (isNaN(targetDate.getTime())) return null;
  const today = new Date();
  const diffTime = targetDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const calculateExpiry = (baseDate, years = 5) => {
  if (!baseDate) return "";
  const d = new Date(baseDate);
  if (isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
};

// รูปหลักฐานอาจเป็น base64 (data URL) หรือ path ของ Backend เดิม
const getProofImageUrl = (proofImg) => {
  if (!proofImg) return "";
  if (proofImg.startsWith("http://") || proofImg.startsWith("https://"))
    return proofImg;
  if (proofImg.startsWith("data:")) return proofImg;
  const clean = proofImg.replace(/^\/+/, "");
  if (clean.startsWith("Backend/")) return `/${clean}`;
  return `/Backend/uploads/${clean}`;
};

// ====================================================
// Component
// ====================================================
export default function AdminApprovalPage() {
  const [db, setDb] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle");

  const loadedDbRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const saveInFlightRef = useRef(false);

  // State สำหรับรับถังแก๊สคืน / ลงทะเบียนถังนอกระบบ
  const [searchSerial, setSearchSerial] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const [importDate, setImportDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newCylinderData, setNewCylinderData] = useState({
    brand: "",
    gas_type: "LPG",
    size: "",
  });

  // Master data (จาก options ที่ derive จาก cylinders เดิม)
  const [masterOptions, setMasterOptions] = useState({
    brands: ["ปตท.", "World Gas", "สยามแก๊ส", "ยูนิคแก๊ส", "PT Gas", "พีเอพี"],
    gas_types: ["LPG"],
    sizes: ["4 กก.", "7 กก.", "11.5 กก.", "13.5 กก.", "15 กก.", "48 กก."],
  });

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

  // ---------- Persist to localStorage ----------
  useEffect(() => {
    if (db) saveLocalDb(db);
  }, [db]);
  useEffect(() => {
    if (options) saveLocalOptions(options);
  }, [options]);

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
  // Master options (merge default + derived จาก options)
  // ====================================================
  useEffect(() => {
    if (!options) return;
    setMasterOptions((prev) => {
      const merge = (a, b) => [...new Set([...(a || []), ...(b || [])])];
      return {
        brands: merge(prev.brands, options.brands || []),
        gas_types: merge(prev.gas_types, options.gas_types || []),
        sizes: merge(prev.sizes, options.sizes || []),
      };
    });
  }, [options]);

  // ====================================================
  // Derived: pending approval list
  // ====================================================
  const tables = db?.tables || {};
  const cylinders = tables.gas_cylinder || [];
  const rawDeliveries = tables.delivery || [];
  const customers = tables.customer || [];

  const pendingList = useMemo(() => {
    return rawDeliveries
      .filter((d) => (d.status || "").toLowerCase() === "pending_approval")
      .map((d) => {
        const cust =
          customers.find((c) => c.customer_id === d.customer_id) ||
          customers.find(
            (c) =>
              (c.phone || c.customer_phone || "").trim() ===
              String(d.phone || "").trim()
          );
        return {
          ...d,
          delivery_id: d.delivery_id,
          customer_name:
            d.customer_name || cust?.name || cust?.customer_name || "-",
          phone: d.phone || cust?.phone || cust?.customer_phone || "-",
          address: d.address || cust?.address || cust?.customer_address || "-",
          brand: d.brand || d.req_brand || "-",
          gas_type: d.gas_type || d.req_gas_type || "LPG",
          size: d.size || d.req_size || "-",
          staff_name: d.staff_name || "-",
          proof_image_path: d.proof_image_path || d.proofImagePath || "",
        };
      });
  }, [rawDeliveries, customers]);

  // ====================================================
  // Approve delivery
  // ====================================================
  const handleApprove = (deliveryId) => {
    if (!confirm(`ยืนยันการอนุมัติงานจัดส่ง รหัส #${deliveryId} ใช่หรือไม่?`))
      return;

    updateDb((draft) => {
      const list = draft.tables.delivery || [];
      const idx = list.findIndex((d) => d.delivery_id === deliveryId);
      if (idx >= 0) {
        const target = list[idx];

        // อัปเดต delivery → success
        list[idx] = {
          ...target,
          status: "success",
          delivered_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // อัปเดตถังที่ส่งไป → success + ส่งถึงลูกค้า
        const sentSerial = target.serial_number;
        if (sentSerial) {
          const cylList = draft.tables.gas_cylinder || [];
          const cIdx = cylList.findIndex(
            (c) => c.serial_number === sentSerial
          );
          if (cIdx >= 0) {
            cylList[cIdx] = {
              ...cylList[cIdx],
              status: "success",
              current_location: "ส่งถึงลูกค้า",
              delivered_date: new Date().toISOString().split("T")[0],
              updated_at: new Date().toISOString(),
            };
          }
        }
      }
    });

    alert("อนุมัติงานจัดส่งเรียบร้อยแล้ว");
  };

  // ====================================================
  // ค้นหาถังแก๊สใน db
  // ====================================================
  const handleSearchCylinder = (e) => {
    if (e) e.preventDefault();
    if (!searchSerial.trim()) return alert("กรุณากรอก Serial Number");

    setIsSearching(true);
    setSearchResult(null);

    const target = searchSerial.trim();
    const found = cylinders.find(
      (c) => String(c.serial_number || "").trim() === target
    );

    if (found) {
      const nextCheck =
        found.next_check_date ||
        found.next_inspection_date ||
        calculateExpiry(found.last_check_date || found.manufacture_date, 5);
      setSearchResult({
        found: true,
        data: {
          serial_number: found.serial_number,
          brand: found.brand,
          gas_type: found.gas_type,
          size: found.size,
          import_date: found.delivered_date || found.updated_at || "",
          next_inspection_date: nextCheck,
          days_left: calculateDaysLeft(nextCheck),
          _raw: found,
        },
      });
    } else {
      setSearchResult({ found: false });
    }

    setIsSearching(false);
  };

  // ====================================================
  // รับถังคืน (มีอยู่แล้วในระบบ)
  // ====================================================
  const handleConfirmReturn = () => {
    const target = searchSerial.trim();
    if (!target) return;

    updateDb((draft) => {
      const cylList = draft.tables.gas_cylinder || [];
      const idx = cylList.findIndex(
        (c) => String(c.serial_number || "").trim() === target
      );
      if (idx >= 0) {
        const nextCheck = calculateExpiry(importDate, 5);
        cylList[idx] = {
          ...cylList[idx],
          status: "ในคลัง",
          current_location: "คลัง",
          last_check_date: importDate,
          next_check_date: nextCheck,
          delivered_date: importDate,
          updated_at: new Date().toISOString(),
        };
      }
    });

    alert(
      `รับถัง "${target}" กลับเข้าคลังเรียบร้อยแล้ว (เริ่มนับรอบตรวจสอบใหม่ +5 ปี)`
    );
    setSearchSerial("");
    setSearchResult(null);
  };

  // ====================================================
  // ลงทะเบียนถังใหม่เข้าคลัง
  // ====================================================
  const handleAddNewCylinder = (e) => {
    e.preventDefault();
    if (
      !newCylinderData.brand ||
      !newCylinderData.gas_type ||
      !newCylinderData.size
    ) {
      return alert("กรุณาเลือกข้อมูลถังแก๊สใหม่ให้ครบถ้วน");
    }

    const serial = searchSerial.trim();
    if (!serial) return alert("ไม่พบ Serial Number");

    const dup = cylinders.some(
      (c) => String(c.serial_number || "").trim() === serial
    );
    if (dup) {
      alert("Serial Number นี้มีอยู่ในระบบแล้ว");
      return;
    }

    const nextCheck = calculateExpiry(importDate, 5);
    const expiry = calculateExpiry(importDate, 10);

    updateDb((draft) => {
      const cylList = draft.tables.gas_cylinder || [];
      cylList.push({
        cylinder_id: genCylinderId(cylList),
        serial_number: serial,
        brand: newCylinderData.brand,
        gas_type: newCylinderData.gas_type,
        size: newCylinderData.size,
        manufacture_date: importDate,
        expiry_date: expiry,
        last_check_date: importDate,
        next_check_date: nextCheck,
        delivered_date: importDate,
        current_location: "คลัง",
        status: "ในคลัง",
        qr_code: null,
        assigned_to: null,
        assigned_date: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    alert("ลงทะเบียนนำเข้าคลังสำเร็จ");
    setSearchSerial("");
    setSearchResult(null);
    setNewCylinderData({ brand: "", gas_type: "LPG", size: "" });
  };

  // ====================================================
  // Sync label
  // ====================================================
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
            fontFamily: FONT_FAMILY,
          }}
        >
          ⏳ กำลังโหลดข้อมูลจาก Data.json...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "1000px", margin: "0 auto", fontFamily: FONT_FAMILY }}>
        {/* Sync status */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "8px",
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
        </div>

        {/* Card ค้นหา/รับถังแก๊สคืน */}
        <div style={cardContainerStyle}>
          <h3
            style={{
              margin: "0 0 12px 0",
              color: "#38bdf8",
              fontSize: "18px",
            }}
          >
            รับถังแก๊สคืนเข้าคลัง / ลงทะเบียนถังนอกระบบ
          </h3>

          <form
            onSubmit={handleSearchCylinder}
            style={{ display: "flex", gap: "10px" }}
          >
            <input
              type="text"
              placeholder="กรอกเลข SERIAL NUMBER เพื่อค้นหา..."
              value={searchSerial}
              onChange={(e) => {
                setSearchSerial(e.target.value);
                setSearchResult(null);
              }}
              style={inputStyle}
            />
            <button type="submit" disabled={isSearching} style={primaryBtnStyle}>
              {isSearching ? "กำลังค้นหา..." : "ตรวจสอบ"}
            </button>
          </form>

          {/* พบข้อมูลถังเดิม */}
          {searchResult && searchResult.found && (
            <div style={resultBoxStyle("#166534", "#bbf7d0")}>
              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
                ✅ พบข้อมูลถังแก๊สในระบบ:
              </p>
              <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
                <div>
                  <strong>Serial:</strong> {searchResult.data.serial_number}
                </div>
                <div>
                  <strong>ยี่ห้อ/ประเภท/ขนาด:</strong> {searchResult.data.brand}{" "}
                  | {searchResult.data.gas_type} | {searchResult.data.size}
                </div>
                <div>
                  <strong>วันที่นำเข้าครั้งล่าสุด:</strong>{" "}
                  {searchResult.data.import_date || "ยังไม่มีข้อมูล"}
                </div>

                {searchResult.data.next_inspection_date && (
                  <div
                    style={{
                      marginTop: "6px",
                      background: "rgba(0,0,0,0.2)",
                      padding: "8px",
                      borderRadius: "6px",
                    }}
                  >
                    <strong>กำหนดตรวจสภาพครั้งถัดไป:</strong>{" "}
                    {searchResult.data.next_inspection_date}
                    <span
                      style={{
                        color: "#facc15",
                        fontWeight: "bold",
                        marginLeft: "10px",
                      }}
                    >
                      (เหลือเวลาอีก{" "}
                      {searchResult.data.days_left ??
                        calculateDaysLeft(searchResult.data.next_inspection_date)}{" "}
                      วัน)
                    </span>
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: "12px",
                  borderTop: "1px solid rgba(255,255,255,0.2)",
                  paddingTop: "10px",
                }}
              >
                <label style={{ ...labelStyle, color: "#fff" }}>
                  ระบุวันที่นำเข้ากลับคลังครั้งนี้:
                </label>
                <input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  style={{ ...inputStyle, width: "auto", marginBottom: "10px" }}
                />
                <button
                  onClick={handleConfirmReturn}
                  style={{
                    ...primaryBtnStyle,
                    width: "100%",
                    background: "#22c55e",
                  }}
                >
                  ยืนยันรับถังนี้กลับเข้าคลังและเริ่มนับรอบตรวจสอบใหม่
                </button>
              </div>
            </div>
          )}

          {/* ไม่พบข้อมูล → ลงทะเบียนใหม่ */}
          {searchResult && !searchResult.found && (
            <div style={resultBoxStyle("#991b1b", "#fecaca")}>
              <p style={{ margin: "0 0 12px 0", fontWeight: "bold" }}>
                ⚠️ ไม่พบ Serial Number "{searchSerial}" ในระบบ
                กรุณาลงทะเบียนนำถังเข้าคลัง
              </p>

              <form
                onSubmit={handleAddNewCylinder}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "10px",
                }}
              >
                {/* ยี่ห้อ */}
                <div>
                  <label style={labelStyle}>ยี่ห้อ *</label>
                  <select
                    value={newCylinderData.brand}
                    onChange={(e) =>
                      setNewCylinderData({
                        ...newCylinderData,
                        brand: e.target.value,
                      })
                    }
                    style={selectStyle}
                    required
                  >
                    <option value="">เลือกยี่ห้อ</option>
                    {masterOptions.brands.map((b, idx) => (
                      <option key={idx} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ชนิดแก๊ส */}
                <div>
                  <label style={labelStyle}>ชนิดแก๊ส *</label>
                  <select
                    value={newCylinderData.gas_type}
                    onChange={(e) =>
                      setNewCylinderData({
                        ...newCylinderData,
                        gas_type: e.target.value,
                      })
                    }
                    style={selectStyle}
                    required
                  >
                    {masterOptions.gas_types.map((g, idx) => (
                      <option key={idx} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ขนาดถัง */}
                <div>
                  <label style={labelStyle}>ขนาดถัง *</label>
                  <select
                    value={newCylinderData.size}
                    onChange={(e) =>
                      setNewCylinderData({
                        ...newCylinderData,
                        size: e.target.value,
                      })
                    }
                    style={selectStyle}
                    required
                  >
                    <option value="">เลือกขนาด</option>
                    {masterOptions.sizes.map((s, idx) => (
                      <option key={idx} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: "span 3" }}>
                  <label style={labelStyle}>วันที่นำเข้าคลัง</label>
                  <input
                    type="date"
                    value={importDate}
                    onChange={(e) => setImportDate(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ gridColumn: "span 3", marginTop: "5px" }}>
                  <button
                    type="submit"
                    style={{
                      ...primaryBtnStyle,
                      width: "100%",
                      background: "#3b82f6",
                    }}
                  >
                    ลงทะเบียนนำเข้าคลัง
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* อนุมัติการจัดส่ง */}
        <h2 style={{ fontSize: "24px", marginBottom: "20px", color: "white" }}>
          อนุมัติการจัดส่ง (Admin Approval)
        </h2>

        {pendingList.length === 0 ? (
          <div
            style={{
              padding: "30px",
              background: "#1f2937",
              borderRadius: "12px",
              textAlign: "center",
              color: "white",
            }}
          >
            ไม่มีรายการที่รออนุมัติในขณะนี้
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {pendingList.map((item) => (
              <div
                key={item.delivery_id}
                style={{
                  background: "#1f2937",
                  borderRadius: "12px",
                  padding: "20px",
                  display: "grid",
                  gridTemplateColumns: "1fr 260px",
                  gap: "20px",
                  color: "white",
                }}
              >
                <div>
                  <h3 style={{ marginTop: 0 }}>รหัสงาน: #{item.delivery_id}</h3>
                  <p>
                    <strong>ลูกค้า:</strong> {item.customer_name} ({item.phone})
                  </p>
                  <p>
                    <strong>ที่อยู่:</strong> {item.address}
                  </p>
                  <p>
                    <strong>ประเภทแก๊ส:</strong> {item.brand} | {item.gas_type} |{" "}
                    {item.size}
                  </p>
                  <p>
                    <strong>ผู้จัดส่ง:</strong>{" "}
                    {item.staff_name || item.staff_id || "-"}
                  </p>

                  {item.serial_number && (
                    <p>
                      <strong>Serial ถังที่ส่ง:</strong>{" "}
                      <span style={{ color: "#4ade80", fontWeight: "bold" }}>
                        {item.serial_number}
                      </span>
                    </p>
                  )}

                  <button
                    onClick={() => handleApprove(item.delivery_id)}
                    style={{
                      marginTop: "15px",
                      padding: "10px 20px",
                      background: "#22c55e",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontSize: "16px",
                      fontFamily: FONT_FAMILY,
                    }}
                  >
                    อนุมัติงานจัดส่ง
                  </button>
                </div>

                <div>
                  <p
                    style={{
                      fontWeight: "bold",
                      marginTop: 0,
                      marginBottom: "8px",
                    }}
                  >
                    รูปหลักฐานจัดส่ง:
                  </p>
                  {item.proof_image_path ? (
                    <img
                      src={getProofImageUrl(item.proof_image_path)}
                      alt="หลักฐาน"
                      style={{
                        width: "100%",
                        height: "180px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        border: "1px solid #374151",
                      }}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        height: "180px",
                        background: "#0f172a",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#64748b",
                      }}
                    >
                      ไม่มีรูปภาพ
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ====================================================
// Styles
// ====================================================
const cardContainerStyle = {
  background: "#1f2937",
  borderRadius: "12px",
  padding: "20px",
  marginBottom: "30px",
  border: "1px solid #374151",
  fontFamily: FONT_FAMILY,
  color: "white",
};

const inputStyle = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  width: "100%",
  fontSize: "14px",
  boxSizing: "border-box",
  fontFamily: FONT_FAMILY,
};

const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
  fontFamily: FONT_FAMILY,
};

const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "#9ca3af",
  marginBottom: "4px",
  fontFamily: FONT_FAMILY,
};

const primaryBtnStyle = {
  padding: "10px 20px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "14px",
  whiteSpace: "nowrap",
  fontFamily: FONT_FAMILY,
};

const resultBoxStyle = (bgColor, textColor) => ({
  marginTop: "15px",
  padding: "15px",
  borderRadius: "8px",
  background: bgColor,
  color: textColor,
  fontFamily: FONT_FAMILY,
});