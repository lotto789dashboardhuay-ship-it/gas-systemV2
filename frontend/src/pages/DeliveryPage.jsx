import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Layout from "../components/Layout";
import { Html5QrcodeScanner } from "html5-qrcode";

// ====================================================
// Persistence (เชื่อม JSON เดียวกับ GasPage ผ่าน /api/data)
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

const genDeliveryId = (list) => {
  const nums = list
    .map((d) =>
      parseInt(String(d.delivery_id || "").replace(/\D/g, ""), 10)
    )
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `DLV${String(next).padStart(3, "0")}`;
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

const genCustomerId = (list) => {
  const nums = list
    .map((c) =>
      parseInt(String(c.customer_id || "").replace(/\D/g, ""), 10)
    )
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `CUS${String(next).padStart(3, "0")}`;
};

// ---------- User info ----------
const getInitialUserData = () => {
  const storedRole = localStorage.getItem("role") || "";
  const storedUsername =
    localStorage.getItem("username") ||
    localStorage.getItem("userName") ||
    localStorage.getItem("name") ||
    "";

  let storedStaffId = localStorage.getItem("staff_id") || "";
  if (!storedStaffId) {
    try {
      const userJson = JSON.parse(localStorage.getItem("user") || "{}");
      storedStaffId = userJson.id || userJson.staff_id || "";
    } catch (e) {
      storedStaffId = "";
    }
  }

  return { storedRole, storedUsername, storedStaffId };
};

// ---------- File helpers ----------
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ====================================================
// Component
// ====================================================
function DeliveryPage() {
  const { storedRole, storedUsername, storedStaffId } = getInitialUserData();

  const [role] = useState(storedRole);
  const [username] = useState(storedUsername);
  const [staffId] = useState(storedStaffId);

  const [db, setDb] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle");

  const loadedDbRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const seededRef = useRef(false);

  // ---------- UI state ----------
  const [gettingLocationId, setGettingLocationId] = useState(null);
  const [selectedProofId, setSelectedProofId] = useState(null);
  const [confirmCylinderInputs, setConfirmCylinderInputs] = useState({});
  const [adminApproveInputs, setAdminApproveInputs] = useState({});
  const [scanningJobId, setScanningJobId] = useState(null);

  const [showCylinderModal, setShowCylinderModal] = useState(false);
  const [pendingApproveId, setPendingApproveId] = useState(null);
  const [newCylinderForApproval, setNewCylinderForApproval] = useState({
    serial_number: "",
    gas_type: "LPG",
    brand: "",
    size: "",
    manufacture_date: "",
    expiry_date: "",
    qr_code: "",
    last_check_date: "",
    next_check_date: "",
    delivered_date: "",
    current_location: "คลัง",
  });

  const [newCustomerName, setNewCustomerName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newMapPin, setNewMapPin] = useState("");

  const [isCustomerFound, setIsCustomerFound] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editCustomerData, setEditCustomerData] = useState({
    old_phone: "",
    new_phone: "",
    name: "",
    address: "",
    map_pin: "",
  });

  const [newBrand, setNewBrand] = useState("");
  const [newGasType, setNewGasType] = useState("LPG");
  const [newSize, setNewSize] = useState("");
  const [newStaffId, setNewStaffId] = useState("");

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
        setOptions(loadLocalOptions() || deriveOptions(norm.tables.gas_cylinder));
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
          setOptions(loadLocalOptions() || deriveOptions(norm.tables.gas_cylinder));
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

  // ---------- Realtime auto-save (coalesce) ----------
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

  // ---------- Seed default staff (ครั้งแรก) ----------
  useEffect(() => {
    if (!db || loading || seededRef.current) return;
    if ((db.tables.delivery_staff || []).length > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    setDb((prev) => {
      if (!prev) return prev;
      if ((prev.tables.delivery_staff || []).length > 0) return prev;
      const next = clone(prev);
      next.tables.delivery_staff = [
        { staff_id: "STF001", staff_name: "สมชาย ใจดี" },
        { staff_id: "STF002", staff_name: "สมหญิง รักงาน" },
        { staff_id: "STF003", staff_name: "วิชัย ขับดี" },
      ];
      return next;
    });
  }, [db, loading]);

  // ---------- Update helper ----------
  const updateDb = useCallback((updater) => {
    setDb((prev) => {
      const next = clone(prev || emptyDb());
      updater(next);
      return next;
    });
  }, []);

  // ====================================================
  // Derived data
  // ====================================================
  const tables = db?.tables || {};
  const rawDeliveries = tables.delivery || [];
  const cylinders = tables.gas_cylinder || [];
  const staffs = tables.delivery_staff || [];
  const customers = tables.customer || [];

  // enrich deliveries with customer name/address
  const deliveries = useMemo(() => {
    return rawDeliveries.map((d) => {
      const cust =
        customers.find((c) => c.customer_id === d.customer_id) ||
        customers.find(
          (c) =>
            (c.phone || c.customer_phone || "").trim() ===
            String(d.phone || "").trim()
        );
      return {
        ...d,
        // unified view for UI
        id: d.delivery_id,
        customerName: d.customer_name || cust?.name || cust?.customer_name || "-",
        phone: d.phone || cust?.phone || cust?.customer_phone || "-",
        address: d.address || cust?.address || cust?.customer_address || "-",
        mapPin: d.map_pin || cust?.map_pin || cust?.mapPin || "",
        brand: d.brand || d.req_brand || "-",
        gasType: d.gas_type || d.gasType || d.req_gas_type || "LPG",
        size: d.size || d.req_size || "-",
        assignedStaff: d.staff_name || "-",
        proofImagePath: d.proof_image_path || d.proofImagePath || "",
      };
    });
  }, [rawDeliveries, customers]);

  // ---------- Options ----------
  const brandOptions = useMemo(() => {
    const base = ["ปตท.", "World Gas", "สยามแก๊ส", "ยูนิคแก๊ส", "PT Gas", "พีเอพี"];
    const derived = options?.brands || [];
    return [...new Set([...derived, ...base])];
  }, [options]);
  const gasTypeOptions = useMemo(() => ["LPG"], []);
  const sizeOptions = useMemo(() => {
    const base = ["4 กก.", "7 กก.", "11.5 กก.", "13.5 กก.", "15 กก.", "48 กก."];
    const derived = options?.sizes || [];
    return [...new Set([...derived, ...base])];
  }, [options]);

  // ====================================================
  // Helpers
  // ====================================================
  const findCustomerByPhone = (phone) =>
    customers.find(
      (c) => (c.phone || c.customer_phone || "").trim() === phone.trim()
    );

  const calculateExpiry = (manuDate) => {
    if (!manuDate) return "";
    const d = new Date(manuDate);
    d.setFullYear(d.getFullYear() + 5);
    return d.toISOString().split("T")[0];
  };

  // ---------- QR scanner ----------
  useEffect(() => {
    let scanner = null;
    if (scanningJobId) {
      scanner = new Html5QrcodeScanner(
        "qr-reader-container",
        { fps: 10, qrbox: { width: 220, height: 220 } },
        false
      );

      scanner.render(
        (decodedText) => {
          let extractedSerial = decodedText.split("/").pop().trim();

          try {
            const parsed = JSON.parse(extractedSerial);
            if (parsed && parsed.serial_number) {
              extractedSerial = String(parsed.serial_number).trim();
            }
          } catch (e) {}

          setConfirmCylinderInputs((prev) => ({
            ...prev,
            [scanningJobId]: extractedSerial,
          }));

          scanner.clear().catch((err) => console.error(err));
          setScanningJobId(null);
        },
        () => {}
      );
    }

    return () => {
      if (scanner) {
        scanner.clear().catch((err) => console.error(err));
      }
    };
  }, [scanningJobId]);

  // ====================================================
  // GPS: บันทึกพิกัดลง customer
  // ====================================================
  const handleSaveCurrentLocation = (item) => {
    if (!navigator.geolocation) {
      alert("อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการดึงพิกัด GPS");
      return;
    }

    setGettingLocationId(item.id);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const mapPinString = `${lat},${lng}`;

        // อัปเดตใน delivery + customer (ถ้ามี)
        updateDb((draft) => {
          const list = draft.tables.delivery || [];
          const idx = list.findIndex((d) => d.delivery_id === item.id);
          if (idx >= 0) {
            list[idx] = { ...list[idx], map_pin: mapPinString, updated_at: new Date().toISOString() };
          }
          const custList = draft.tables.customer || [];
          const cIdx = custList.findIndex(
            (c) => (c.phone || c.customer_phone || "").trim() === String(item.phone || "").trim()
          );
          if (cIdx >= 0) {
            custList[cIdx] = { ...custList[cIdx], map_pin: mapPinString, updated_at: new Date().toISOString() };
          }
        });

        alert(`บันทึกพิกัด GPS สำเร็จ: ${mapPinString}`);
        setGettingLocationId(null);
      },
      (error) => {
        setGettingLocationId(null);
        console.error("Geolocation error:", error);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            alert("กรุณาเปิดสิทธิ์การเข้าถึงตำแหน่ง GPS บนอุปกรณ์/เบราว์เซอร์");
            break;
          case error.POSITION_UNAVAILABLE:
            alert("ไม่สามารถระบุตำแหน่งพิกัด GPS ในขณะนี้ได้");
            break;
          case error.TIMEOUT:
            alert("หมดเวลาในการดึงตำแหน่ง GPS กรุณาลองใหม่อีกครั้ง");
            break;
          default:
            alert("เกิดข้อผิดพลาดในการรับพิกัด GPS");
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // ====================================================
  // Customer
  // ====================================================
  const handleSearchCustomer = () => {
    if (!newPhone.trim()) {
      alert("กรุณากรอกเบอร์โทรศัพท์เพื่อค้นหา");
      return;
    }

    const exist = findCustomerByPhone(newPhone);
    if (exist) {
      setNewCustomerName(exist.name || exist.customer_name || "");
      setNewAddress(exist.address || exist.customer_address || "");
      setNewMapPin(exist.map_pin || exist.mapPin || "");
      setIsCustomerFound(true);
      alert("พบข้อมูลลูกค้าในระบบ");
    } else {
      setIsCustomerFound(false);
      alert("ไม่พบข้อมูลลูกค้า เบอร์นี้สามารถกรอกเป็นลูกค้าใหม่ได้ทันที");
    }
  };

  const handleOpenEditCustomer = () => {
    setEditCustomerData({
      old_phone: newPhone,
      new_phone: newPhone,
      name: newCustomerName,
      address: newAddress,
      map_pin: newMapPin,
    });
    setIsEditingCustomer(true);
  };

  const handleSaveCustomerEdit = () => {
    if (!editCustomerData.new_phone.trim()) {
      alert("กรุณากรอกเบอร์โทรศัพท์ใหม่");
      return;
    }

    updateDb((draft) => {
      const list = draft.tables.customer || [];
      const idx = list.findIndex(
        (c) =>
          (c.phone || c.customer_phone || "").trim() ===
          editCustomerData.old_phone.trim()
      );
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          phone: editCustomerData.new_phone.trim(),
          name: editCustomerData.name,
          address: editCustomerData.address,
          map_pin: editCustomerData.map_pin,
          updated_at: new Date().toISOString(),
        };
      } else {
        list.push({
          customer_id: genCustomerId(list),
          phone: editCustomerData.new_phone.trim(),
          name: editCustomerData.name,
          address: editCustomerData.address,
          map_pin: editCustomerData.map_pin,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    });

    setNewPhone(editCustomerData.new_phone);
    setNewCustomerName(editCustomerData.name);
    setNewAddress(editCustomerData.address);
    setNewMapPin(editCustomerData.map_pin);
    setIsEditingCustomer(false);
    alert("อัปเดตข้อมูลลูกค้าเรียบร้อยแล้ว");
  };

  // ====================================================
  // Create Delivery Job
  // ====================================================
  const createDeliveryJob = () => {
    if (!newCustomerName || !newPhone || !newAddress || !newStaffId) {
      alert("กรุณากรอกข้อมูลลูกค้าและพนักงานส่งให้ครบ");
      return;
    }
    if (!newBrand || !newGasType || !newSize) {
      alert("กรุณาระบุยี่ห้อ ชนิดแก๊ส และขนาดถังให้ครบถ้วน");
      return;
    }

    const staff = staffs.find((s) => String(s.staff_id) === String(newStaffId));
    const staffName = staff ? staff.staff_name : "";

    updateDb((draft) => {
      // upsert customer
      const custList = draft.tables.customer || [];
      const cIdx = custList.findIndex(
        (c) => (c.phone || c.customer_phone || "").trim() === newPhone.trim()
      );
      let customerId;
      if (cIdx >= 0) {
        customerId = custList[cIdx].customer_id;
        custList[cIdx] = {
          ...custList[cIdx],
          name: newCustomerName.trim(),
          address: newAddress.trim(),
          map_pin: newMapPin.trim(),
          updated_at: new Date().toISOString(),
        };
      } else {
        customerId = genCustomerId(custList);
        custList.push({
          customer_id: customerId,
          name: newCustomerName.trim(),
          phone: newPhone.trim(),
          address: newAddress.trim(),
          map_pin: newMapPin.trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // push delivery
      const list = draft.tables.delivery || [];
      const deliveryId = genDeliveryId(list);
      list.push({
        delivery_id: deliveryId,
        customer_id: customerId,
        customer_name: newCustomerName.trim(),
        phone: newPhone.trim(),
        address: newAddress.trim(),
        map_pin: newMapPin.trim(),
        req_brand: newBrand,
        req_gas_type: newGasType,
        req_size: newSize,
        brand: newBrand,
        gas_type: newGasType,
        size: newSize,
        staff_id: String(newStaffId),
        staff_name: staffName,
        serial_number: "",
        status: "pending",
        proof_image_path: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    alert("สร้างงานจัดส่งเรียบร้อยแล้ว");

    setNewCustomerName("");
    setNewPhone("");
    setNewAddress("");
    setNewMapPin("");
    setNewBrand("");
    setNewSize("");
    setNewStaffId("");
    setIsCustomerFound(false);
  };

  // ====================================================
  // Staff: confirm receive
  // ====================================================
  const confirmReceiveJob = (jobItem) => {
    const serialNumber = confirmCylinderInputs[jobItem.id]?.trim();
    if (!serialNumber) return alert("กรุณาสแกน QR Code ถังแก๊สเพื่อยืนยัน");

    const cylinder = cylinders.find((c) => c.serial_number === serialNumber);
    if (!cylinder) {
      alert(`ไม่พบถังแก๊ส Serial Number "${serialNumber}" ในระบบ`);
      return;
    }
    if ((cylinder.status || "").trim() !== "ในคลัง") {
      alert(`ถังแก๊ส "${serialNumber}" ไม่อยู่ในคลัง (สถานะปัจจุบัน: ${cylinder.status})`);
      return;
    }

    const targetBrand = jobItem.req_brand || jobItem.brand || "";
    const targetGasType = jobItem.req_gas_type || jobItem.gasType || jobItem.gas_type || "";
    const targetSize = jobItem.req_size || jobItem.size || "";

    const cylBrand = cylinder.brand || "";
    const cylGasType = cylinder.gas_type || cylinder.gasType || "";
    const cylSize = cylinder.size || "";

    if (cylBrand !== targetBrand || cylGasType !== targetGasType || cylSize !== targetSize) {
      alert(
        `สเปกถังแก๊สไม่ตรงตามเงื่อนไข!\n\n` +
          `ความต้องการงาน: ${targetBrand} | ${targetGasType} | ${targetSize}\n` +
          `ถังที่สแกนได้: ${cylBrand} | ${cylGasType} | ${cylSize}`
      );
      return;
    }

    updateDb((draft) => {
      // update delivery
      const list = draft.tables.delivery || [];
      const idx = list.findIndex((d) => d.delivery_id === jobItem.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          serial_number: serialNumber,
          status: "delivering",
          updated_at: new Date().toISOString(),
        };
      }
      // update cylinder status
      const cylList = draft.tables.gas_cylinder || [];
      const cIdx = cylList.findIndex((c) => c.serial_number === serialNumber);
      if (cIdx >= 0) {
        cylList[cIdx] = {
          ...cylList[cIdx],
          status: "pending",
          current_location: "กำลังจัดส่ง",
          updated_at: new Date().toISOString(),
        };
      }
    });

    alert("ตรวจสอบสเปกถูกต้อง! รับงานและผูกถังแก๊สเรียบร้อยแล้ว");
    setConfirmCylinderInputs((prev) => ({ ...prev, [jobItem.id]: "" }));
  };

  // ====================================================
  // Staff: proof upload → base64 → pending_approval
  // ====================================================
  const handleProofUpload = async (id, file) => {
    if (!file) return;
    try {
      const dataUrl = await fileToBase64(file);
      // จำกัดขนาด ~3MB
      if (dataUrl.length > 3 * 1024 * 1024 * 1.4) {
        if (!window.confirm("ไฟล์รูปใหญ่เกินไป อาจทำให้ไฟล์ Data.json ใหญ่ขึ้นมาก ต้องการดำเนินการต่อหรือไม่?")) return;
      }

      updateDb((draft) => {
        const list = draft.tables.delivery || [];
        const idx = list.findIndex(
          (d) =>
            String(d.delivery_id) === String(id) || String(d.id) === String(id)
        );
        if (idx >= 0) {
          list[idx] = {
            ...list[idx],
            status: "pending_approval",
            proof_image_path: dataUrl,
            updated_at: new Date().toISOString(),
          };
        }
      });

      alert("ส่งรูปหลักฐานสำเร็จ รออนุมัติงาน");
      setSelectedProofId(null);
    } catch (error) {
      console.error("Upload error:", error);
      alert("เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ");
    }
  };

  // ====================================================
  // Admin: approve / create cylinder
  // ====================================================
  const sendApproveRequest = (id, receivedSerialNumber, newCylinderData = null) => {
    updateDb((draft) => {
      // delivery → success
      const list = draft.tables.delivery || [];
      const idx = list.findIndex((d) => d.delivery_id === id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          status: "success",
          received_serial_number: receivedSerialNumber,
          delivered_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      // cylinder: อัปเดตถังที่ส่งไป (ตัวที่ออกจากคลัง) → จัดส่งสำเร็จ
      const cylList = draft.tables.gas_cylinder || [];
      const sentSerial = list[idx]?.serial_number;
      if (sentSerial) {
        const sIdx = cylList.findIndex((c) => c.serial_number === sentSerial);
        if (sIdx >= 0) {
          cylList[sIdx] = {
            ...cylList[sIdx],
            status: "success",
            current_location: "ส่งถึงลูกค้า",
            delivered_date: new Date().toISOString().split("T")[0],
            updated_at: new Date().toISOString(),
          };
        }
      }

      // cylinder: รับคืน → กลับเข้าคลัง
      if (newCylinderData) {
        const exists = cylList.some((c) => c.serial_number === newCylinderData.serial_number);
        if (!exists) {
          cylList.push({
            cylinder_id: genCylinderId(cylList),
            serial_number: newCylinderData.serial_number,
            brand: newCylinderData.brand,
            gas_type: newCylinderData.gas_type || "LPG",
            size: newCylinderData.size,
            manufacture_date: newCylinderData.manufacture_date,
            expiry_date: newCylinderData.expiry_date,
            last_check_date: newCylinderData.last_check_date,
            next_check_date: newCylinderData.next_check_date,
            delivered_date: newCylinderData.delivered_date,
            current_location: newCylinderData.current_location || "คลัง",
            status: "ในคลัง",
            qr_code: null,
            assigned_to: null,
            assigned_date: null,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } else if (receivedSerialNumber) {
        const rIdx = cylList.findIndex((c) => c.serial_number === receivedSerialNumber);
        if (rIdx >= 0) {
          cylList[rIdx] = {
            ...cylList[rIdx],
            status: "ในคลัง",
            current_location: "คลัง",
            updated_at: new Date().toISOString(),
          };
        }
      }
    });

    alert("อนุมัติงานสำเร็จ");
    setAdminApproveInputs((prev) => ({ ...prev, [id]: "" }));
    setShowCylinderModal(false);
  };

  const approveDelivery = (id) => {
    const receivedSerialNumber = adminApproveInputs[id]?.trim();
    if (!receivedSerialNumber) return alert("กรุณากรอก Serial Number ถังที่รับคืน");

    const exists = cylinders.some((c) => c.serial_number === receivedSerialNumber);
    if (!exists) {
      setPendingApproveId(id);
      setNewCylinderForApproval({
        ...newCylinderForApproval,
        serial_number: receivedSerialNumber,
        gas_type: "LPG",
        brand: "",
        size: "",
        manufacture_date: new Date().toISOString().split("T")[0],
        expiry_date: calculateExpiry(new Date().toISOString().split("T")[0]),
        last_check_date: new Date().toISOString().split("T")[0],
        next_check_date: calculateExpiry(new Date().toISOString().split("T")[0]),
      });
      setShowCylinderModal(true);
      return;
    }
    sendApproveRequest(id, receivedSerialNumber);
  };

  const handleCreateAndApprove = () => {
    const { serial_number, brand, size, manufacture_date } = newCylinderForApproval;
    if (!serial_number || !brand || !size || !manufacture_date) {
      alert("กรุณากรอกข้อมูลให้ครบ (Serial Number, ยี่ห้อ, ขนาด, วันที่ผลิต)");
      return;
    }
    let dataToSend = { ...newCylinderForApproval };
    if (!dataToSend.expiry_date) dataToSend.expiry_date = calculateExpiry(manufacture_date);
    if (!dataToSend.next_check_date) dataToSend.next_check_date = calculateExpiry(manufacture_date);
    if (!dataToSend.last_check_date) dataToSend.last_check_date = manufacture_date;

    sendApproveRequest(pendingApproveId, dataToSend.serial_number, dataToSend);
  };

  // ====================================================
  // Delete delivery
  // ====================================================
  const handleDelete = (item) => {
    const deliveryId = item.id || item.delivery_id;
    if (!deliveryId) return alert("ไม่พบรหัสงานจัดส่ง");
    if (!window.confirm(`คุณต้องการลบงานรหัส #${deliveryId} ใช่หรือไม่?`)) return;

    updateDb((draft) => {
      draft.tables.delivery = (draft.tables.delivery || []).filter(
        (d) => d.delivery_id !== deliveryId
      );
    });
  };

  // ====================================================
  // Visible deliveries (per role)
  // ====================================================
  const availableStaffs = useMemo(() => staffs, [staffs]);

  const visibleDeliveries = useMemo(() => {
    let currentRole = localStorage.getItem("role") || role;
    let currentUsername = (
      localStorage.getItem("username") ||
      localStorage.getItem("userName") ||
      localStorage.getItem("name") ||
      username
    ).toLowerCase();
    let currentStaffId = String(localStorage.getItem("staff_id") || staffId || "").trim();

    if (!currentStaffId) {
      try {
        const userObj = JSON.parse(localStorage.getItem("user") || "{}");
        currentStaffId = String(userObj.id || userObj.staff_id || userObj.user_id || "").trim();
      } catch (e) {}
    }

    if (currentRole === "admin" || currentRole === "ผู้ดูแลระบบ") {
      return deliveries.filter((d) => d.status !== "success");
    }

    return deliveries.filter((d) => {
      if (d.status === "pending_approval" || d.status === "success") return false;

      const dStaffId = String(d.staff_id ?? d.staffId ?? "").trim();
      const dStaffName = String(d.assignedStaff ?? d.staff_name ?? "").toLowerCase();

      const isMyJob =
        (currentStaffId !== "" && dStaffId === currentStaffId) ||
        (currentUsername !== "" &&
          (dStaffName.includes(currentUsername) || currentUsername.includes(dStaffName)));

      const isUnassigned = !dStaffId || dStaffId === "0" || dStaffId === "null";

      if (d.status === "pending") return isMyJob || isUnassigned;
      if (d.status === "delivering") return true;
      return false;
    });
  }, [deliveries, role, username, staffId]);

  const currentStaffActiveJob = useMemo(() => {
    let currentUsername =
      localStorage.getItem("username") ||
      localStorage.getItem("userName") ||
      localStorage.getItem("name") ||
      username;
    let currentStaffId = localStorage.getItem("staff_id") || staffId;

    if (!currentStaffId) {
      try {
        const userObj = JSON.parse(localStorage.getItem("user") || "{}");
        currentStaffId = userObj.id || userObj.staff_id || "";
      } catch (e) {}
    }

    return deliveries.find(
      (d) =>
        d.status === "delivering" &&
        ((currentUsername && (d.assignedStaff || "").includes(currentUsername)) ||
          (currentStaffId && String(d.staff_id) === String(currentStaffId)))
    );
  }, [deliveries, username, staffId]);

  // ====================================================
  // Helpers: status
  // ====================================================
  const getStatusStyle = (status) => {
    switch (status) {
      case "pending":
        return { background: "rgba(234, 179, 8, 0.2)", color: "#facc15", border: "1px solid #ca8a04" };
      case "delivering":
        return { background: "rgba(249, 115, 22, 0.2)", color: "#fb923c", border: "1px solid #ea580c" };
      case "pending_approval":
        return { background: "rgba(168, 85, 247, 0.2)", color: "#c084fc", border: "1px solid #9333ea" };
      case "success":
        return { background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", border: "1px solid #16a34a" };
      default:
        return { background: "rgba(107, 114, 128, 0.2)", color: "#9ca3af", border: "1px solid #4b5563" };
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "pending_approval":
        return "รออนุมัติ";
      case "pending":
        return "กำลังจัดส่ง";
      case "delivering":
        return "กำลังจัดส่ง";
      case "success":
        return "สำเร็จ";
      default:
        return status;
    }
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
        <div style={{ color: "white", textAlign: "center", padding: "60px 20px" }}>
          ⏳ กำลังโหลดข้อมูลงานจัดส่ง...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 12px 40px 12px" }}>
        {/* Sync status bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
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

        {/* Card สร้างงานจัดส่ง (Admin) */}
        {(role === "admin" || role === "ผู้ดูแลระบบ") && (
          <div style={styles.cardContainer}>
            <div style={styles.cardHeader}>
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: "600", color: "#f8fafc" }}>
                สร้างงานจัดส่งใหม่
              </h2>
            </div>

            <div style={{ padding: "16px" }}>
              <div style={{ marginBottom: "16px" }}>
                <label style={styles.label}>ค้นหาเบอร์โทรศัพท์ลูกค้า *</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="กรอกเบอร์โทรศัพท์..."
                    value={newPhone}
                    onChange={(e) => {
                      setNewPhone(e.target.value);
                      setIsCustomerFound(false);
                    }}
                    style={{ ...styles.input, flex: 1, minWidth: "180px" }}
                  />
                  <button type="button" onClick={handleSearchCustomer} style={styles.primaryBtn}>
                    🔍 ค้นหา
                  </button>
                  {isCustomerFound && (
                    <button type="button" onClick={handleOpenEditCustomer} style={styles.warningBtn}>
                      ✏️ แก้ไข
                    </button>
                  )}
                </div>
              </div>

              <div style={styles.formGrid}>
                <div>
                  <label style={styles.label}>ชื่อลูกค้า *</label>
                  <input
                    type="text"
                    placeholder="ระบุชื่อลูกค้า"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Map Pin / พิกัด GPS</label>
                  <input
                    type="text"
                    placeholder="เช่น 13.818, 100.514"
                    value={newMapPin}
                    onChange={(e) => setNewMapPin(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={styles.label}>ที่อยู่จัดส่ง *</label>
                  <textarea
                    rows={2}
                    placeholder="ระบุที่อยู่จัดส่งโดยละเอียด"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    style={{ ...styles.input, resize: "vertical" }}
                  />
                </div>

                <div>
                  <label style={styles.label}>ยี่ห้อถังแก๊ส *</label>
                  <select
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">-- เลือกยี่ห้อ --</option>
                    {brandOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>ชนิดแก๊ส *</label>
                  <select
                    value={newGasType}
                    onChange={(e) => setNewGasType(e.target.value)}
                    style={styles.select}
                  >
                    {gasTypeOptions.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>ขนาดถังแก๊ส *</label>
                  <select
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">-- เลือกขนาด --</option>
                    {sizeOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>พนักงานจัดส่ง *</label>
                  <select
                    value={newStaffId}
                    onChange={(e) => setNewStaffId(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">-- เลือกพนักงานส่ง --</option>
                    {availableStaffs.map((staff) => (
                      <option key={staff.staff_id} value={staff.staff_id}>
                        {staff.staff_id} - {staff.staff_name}
                      </option>
                    ))}
                  </select>
                  {availableStaffs.length === 0 && (
                    <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "4px" }}>
                      ยังไม่มีข้อมูลพนักงานในระบบ
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <button
                  onClick={createDeliveryJob}
                  style={{ ...styles.primaryBtn, width: "100%", padding: "10px", fontSize: "14px" }}
                >
                  สร้างงานจัดส่ง
                </button>
              </div>
            </div>
          </div>
        )}

        {role === "staff" && currentStaffActiveJob && (
          <div style={styles.activeJobBanner}>
            คุณกำลังจัดส่งงาน #{currentStaffActiveJob.id} กรุณาส่งรูปหลักฐานเพื่อปิดงาน
          </div>
        )}

        {/* รายการงานจัดส่ง */}
        <h2 style={{ fontSize: "1.1rem", color: "#f8fafc", marginBottom: "14px", fontWeight: "600" }}>
          รายการงานจัดส่งทั้งหมด ({visibleDeliveries.length})
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {visibleDeliveries.length > 0 ? (
            visibleDeliveries.map((item) => (
              <div key={item.id} style={styles.jobCard}>
                {/* Header */}
                <div style={styles.jobCardHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={styles.jobTag}>งาน #{item.id}</span>
                    <span style={{ ...styles.badge, ...getStatusStyle(item.status) }}>
                      {getStatusText(item.status)}
                    </span>
                  </div>

                  {(role === "admin" || role === "ผู้ดูแลระบบ") &&
                    (item.status === "pending" || item.status === "delivering") && (
                      <button onClick={() => handleDelete(item)} style={styles.dangerBtn}>
                        🗑️ ลบ
                      </button>
                    )}
                </div>

                {/* Body */}
                <div style={styles.jobCardBody}>
                  {/* ลูกค้า */}
                  <div style={styles.infoRow}>
                    <span style={styles.iconSpan}> </span>
                    <div>
                      <div style={{ color: "#ffffff", fontWeight: "600", fontSize: "15px" }}>
                        {item.customerName}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>{item.phone}</div>
                    </div>
                  </div>

                  {/* ที่อยู่ */}
                  <div style={styles.infoRow}>
                    <span style={styles.iconSpan}> </span>
                    <div style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: "1.4" }}>
                      {item.address}
                    </div>
                  </div>

                  {/* สเปกแก๊ส & Serial */}
                  <div style={styles.specBox}>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>สเปกแก๊ส:</div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={styles.specBadge}>{(item.req_brand || item.brand || "-")}</span>
                      <span style={styles.specBadge}>
                        {(item.req_gas_type || item.gasType || item.gas_type || "LPG")}
                      </span>
                      <span style={{ ...styles.specBadge, background: "#0284c7", color: "#fff" }}>
                        {(item.req_size || item.size || "-")}
                      </span>
                    </div>

                    {(item.serial_number || item.deliveryCylinderId) && (
                      <div
                        style={{
                          marginTop: "8px",
                          paddingTop: "8px",
                          borderTop: "1px dashed #334155",
                          fontSize: "13px",
                        }}
                      >
                        <span style={{ color: "#94a3b8" }}>Serial ถังที่ส่ง: </span>
                        <strong style={{ color: "#4ade80" }}>
                          {item.serial_number || item.deliveryCylinderId}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* พนักงาน */}
                  <div style={{ fontSize: "13px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>
                      ผู้รับผิดชอบ: <strong style={{ color: "#e2e8f0" }}>{item.assignedStaff || "ไม่ระบุชื่อ"}</strong>
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={styles.jobCardActions}>
                    {!item.mapPin || item.mapPin === "-" ? (
                      <button
                        type="button"
                        onClick={() => handleSaveCurrentLocation(item)}
                        disabled={gettingLocationId === item.id}
                        style={styles.gpsPinBtn}
                      >
                        {gettingLocationId === item.id ? "กำลังบันทึกพิกัด..." : "ปักหมุดตำแหน่งปัจจุบัน"}
                      </button>
                    ) : (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mapPin)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.gpsLinkBtn}
                      >
                        เปิด Google Maps ({item.mapPin})
                      </a>
                    )}

                    {/* Staff: รับงาน */}
                    {role === "staff" && item.status === "pending" && (
                      <div style={{ width: "100%", marginTop: "6px" }}>
                        {scanningJobId === item.id ? (
                          <div style={{ textAlign: "center" }}>
                            <div
                              id="qr-reader-container"
                              style={{ width: "100%", background: "#fff", borderRadius: "8px", overflow: "hidden" }}
                            ></div>
                            <button
                              onClick={() => setScanningJobId(null)}
                              style={{ ...styles.secondaryBtn, width: "100%", marginTop: "8px" }}
                            >
                              ยกเลิกการสแกน
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <button
                              onClick={() => setScanningJobId(item.id)}
                              style={{ ...styles.secondaryBtn, background: "#0284c7" }}
                            >
                              สแกน QR Code ถัง
                            </button>

                            {confirmCylinderInputs[item.id] && (
                              <div
                                style={{
                                  background: "#0f172a",
                                  padding: "8px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  textAlign: "center",
                                }}
                              >
                                Serial ที่สแกน:{" "}
                                <strong style={{ color: "#4ade80" }}>{confirmCylinderInputs[item.id]}</strong>
                              </div>
                            )}

                            <button
                              onClick={() => confirmReceiveJob(item)}
                              disabled={!confirmCylinderInputs[item.id]}
                              style={{
                                ...styles.primaryBtn,
                                opacity: confirmCylinderInputs[item.id] ? 1 : 0.5,
                                cursor: confirmCylinderInputs[item.id] ? "pointer" : "not-allowed",
                              }}
                            >
                              ยืนยันรับงานส่ง
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Staff: ถ่ายรูปถังคืน */}
                    {role === "staff" && item.status === "delivering" && (
                      <div style={{ width: "100%", marginTop: "6px" }}>
                        <button
                          onClick={() => setSelectedProofId(selectedProofId === item.id ? null : item.id)}
                          style={styles.cameraBtn}
                        >
                          ถ่ายรูปถังที่รับคืน
                        </button>
                        {selectedProofId === item.id && (
                          <div style={{ marginTop: "8px" }}>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => handleProofUpload(item.id, e.target.files?.[0])}
                              style={{ color: "white", fontSize: "12px", width: "100%" }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Admin: อนุมัติงาน */}
                    {(role === "admin" || role === "ผู้ดูแลระบบ") && item.status === "pending_approval" && (
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          marginTop: "6px",
                        }}
                      >
                        {item.proofImagePath && (
                          <img src={item.proofImagePath} alt="proof" style={styles.proofImgPreview} />
                        )}
                        <input
                          type="text"
                          placeholder="กรอก Serial ถังที่รับคืน"
                          value={adminApproveInputs[item.id] ?? ""}
                          onChange={(e) =>
                            setAdminApproveInputs((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          style={styles.input}
                        />
                        <button
                          onClick={() => approveDelivery(item.id)}
                          style={{ ...styles.primaryBtn, background: "#16a34a" }}
                        >
                          อนุมัติงานส่ง
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={styles.emptyCard}>ไม่มีรายการงานจัดส่งในขณะนี้</div>
          )}
        </div>

        {/* Modal แก้ไขลูกค้า */}
        {isEditingCustomer && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalBody}>
              <h3 style={{ marginTop: 0, color: "#fff", fontSize: "16px" }}>แก้ไขข้อมูลลูกค้า</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
                <div>
                  <label style={styles.label}>เบอร์โทรศัพท์ *</label>
                  <input
                    value={editCustomerData.new_phone}
                    onChange={(e) => setEditCustomerData({ ...editCustomerData, new_phone: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>ชื่อลูกค้า *</label>
                  <input
                    value={editCustomerData.name}
                    onChange={(e) => setEditCustomerData({ ...editCustomerData, name: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>ที่อยู่ *</label>
                  <textarea
                    rows={2}
                    value={editCustomerData.address}
                    onChange={(e) => setEditCustomerData({ ...editCustomerData, address: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Map Pin / พิกัด GPS</label>
                  <input
                    value={editCustomerData.map_pin}
                    onChange={(e) => setEditCustomerData({ ...editCustomerData, map_pin: e.target.value })}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button onClick={() => setIsEditingCustomer(false)} style={{ ...styles.secondaryBtn, flex: 1 }}>
                  ยกเลิก
                </button>
                <button onClick={handleSaveCustomerEdit} style={{ ...styles.warningBtn, flex: 1 }}>
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal ลงทะเบียนถังใหม่ */}
        {showCylinderModal && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalBody}>
              <h3 style={{ marginTop: 0, color: "#fff", fontSize: "16px" }}>➕ เพิ่มถังใหม่เข้าระบบ</h3>
              <p style={{ fontSize: "13px", color: "#94a3b8" }}>
                ไม่พบ Serial Number{" "}
                <strong style={{ color: "#facc15" }}>{newCylinderForApproval.serial_number}</strong>{" "}
                ในฐานข้อมูล
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                <div>
                  <label style={styles.label}>Serial Number *</label>
                  <input
                    value={newCylinderForApproval.serial_number}
                    onChange={(e) =>
                      setNewCylinderForApproval({
                        ...newCylinderForApproval,
                        serial_number: e.target.value,
                      })
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>ยี่ห้อ *</label>
                  <select
                    value={newCylinderForApproval.brand}
                    onChange={(e) =>
                      setNewCylinderForApproval({ ...newCylinderForApproval, brand: e.target.value })
                    }
                    style={styles.select}
                  >
                    <option value="">-- เลือกยี่ห้อ --</option>
                    {brandOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>ชนิดแก๊ส</label>
                  <select
                    value={newCylinderForApproval.gas_type}
                    onChange={(e) =>
                      setNewCylinderForApproval({ ...newCylinderForApproval, gas_type: e.target.value })
                    }
                    style={styles.select}
                  >
                    <option value="LPG">LPG</option>
                  </select>
                </div>
                <div>
                  <label style={styles.label}>ขนาดถัง *</label>
                  <select
                    value={newCylinderForApproval.size}
                    onChange={(e) =>
                      setNewCylinderForApproval({ ...newCylinderForApproval, size: e.target.value })
                    }
                    style={styles.select}
                  >
                    <option value="">-- เลือกขนาด --</option>
                    {sizeOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>วันที่ผลิต *</label>
                  <input
                    type="date"
                    value={newCylinderForApproval.manufacture_date}
                    onChange={(e) => {
                      const manu = e.target.value;
                      setNewCylinderForApproval({
                        ...newCylinderForApproval,
                        manufacture_date: manu,
                        expiry_date: calculateExpiry(manu),
                        next_check_date: calculateExpiry(manu),
                        last_check_date: manu,
                      });
                    }}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button onClick={() => setShowCylinderModal(false)} style={{ ...styles.secondaryBtn, flex: 1 }}>
                  ยกเลิก
                </button>
                <button onClick={handleCreateAndApprove} style={{ ...styles.primaryBtn, flex: 1 }}>
                  ยืนยันและอนุมัติ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ====================================================
// Styles
// ====================================================
const styles = {
  cardContainer: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
    overflow: "hidden",
    marginBottom: "20px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
  },
  cardHeader: {
    padding: "12px 16px",
    background: "#0f172a",
    borderBottom: "1px solid #334155",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: "500",
    color: "#94a3b8",
    marginBottom: "4px",
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f8fafc",
    fontSize: "13px",
    boxSizing: "border-box",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f8fafc",
    fontSize: "13px",
    boxSizing: "border-box",
    cursor: "pointer",
  },
  primaryBtn: {
    padding: "8px 14px",
    background: "#0284c7",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryBtn: {
    padding: "8px 14px",
    background: "#475569",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  warningBtn: {
    padding: "8px 14px",
    background: "#d97706",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dangerBtn: {
    padding: "4px 8px",
    background: "rgba(239, 68, 68, 0.2)",
    color: "#f87171",
    border: "1px solid #ef4444",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  badge: {
    fontFamily: "'Prompt', sans-serif",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "bold",
  },
  jobCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
  jobCardHeader: {
    padding: "10px 14px",
    background: "#0f172a",
    borderBottom: "1px solid #334155",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  jobTag: {
    fontSize: "13px",
    fontWeight: "bold",
    color: "#38bdf8",
    background: "rgba(56, 189, 248, 0.1)",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  jobCardBody: {
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  infoRow: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
  },
  iconSpan: {
    fontSize: "16px",
    lineHeight: "1.2",
  },
  specBox: {
    background: "#0f172a",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #1e293b",
  },
  specBadge: {
    background: "#334155",
    color: "#f8fafc",
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "500",
  },
  jobCardActions: {
    marginTop: "4px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  gpsPinBtn: {
    width: "100%",
    padding: "8px 12px",
    background: "#0284c7",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    textAlign: "center",
  },
  gpsLinkBtn: {
    display: "block",
    textAlign: "center",
    padding: "6px 10px",
    background: "rgba(56, 189, 248, 0.1)",
    color: "#38bdf8",
    border: "1px solid #0284c7",
    borderRadius: "6px",
    fontSize: "12px",
    textDecoration: "none",
    fontWeight: "500",
  },
  cameraBtn: {
    width: "100%",
    padding: "10px",
    background: "#d97706",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  emptyCard: {
    background: "#1e293b",
    padding: "24px",
    borderRadius: "10px",
    textAlign: "center",
    color: "#94a3b8",
    fontSize: "13px",
    border: "1px solid #334155",
  },
  activeJobBanner: {
    background: "#9a3412",
    color: "#ffedd5",
    padding: "10px 14px",
    borderRadius: "8px",
    marginBottom: "14px",
    fontSize: "13px",
    fontWeight: "bold",
    textAlign: "center",
  },
  proofImgPreview: {
    width: "100%",
    maxHeight: "220px",
    objectFit: "contain",
    borderRadius: "6px",
    border: "1px solid #334155",
    background: "#0f172a",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "16px",
  },
  modalBody: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "18px",
    width: "100%",
    maxWidth: "400px",
    maxHeight: "90vh",
    overflowY: "auto",
    boxSizing: "border-box",
  },
};

export default DeliveryPage;