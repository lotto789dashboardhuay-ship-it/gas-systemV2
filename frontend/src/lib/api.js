// src/lib/api.js
const BASE = import.meta.env?.VITE_API_BASE_URL || "";

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

// ดึงข้อมูลทั้งหมด
export const getAllData = () => request("/api/data");

// เขียนทับทั้งก้อน
export const saveAllData = (payload) =>
  request("/api/data", { method: "POST", body: JSON.stringify(payload) });

// อัปเดตแค่ตารางเดียว -> updateTable("gas_cylinder", rows)
export const updateTable = (table, rows) =>
  request("/api/data", {
    method: "PATCH",
    body: JSON.stringify({ table, rows }),
  });

// merge หลายตาราง -> updateTables({ gas_cylinder: [...], delivery: [...] })
export const updateTables = (tables) =>
  request("/api/data", {
    method: "PATCH",
    body: JSON.stringify({ tables }),
  });
