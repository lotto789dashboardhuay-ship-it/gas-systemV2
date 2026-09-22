// scripts/migrate.js
import fs from "node:fs/promises";
import path from "node:path";
import { kv } from "@vercel/kv";

const SQL_FILE = path.join(process.cwd(), "gas_system.sql");
const KV_KEY = "gas:data";

// ---------- 1. Parser: แปลงค่าใน SQL เป็น JS value ----------
function parseValueList(str) {
  // str ตัวอย่าง: (1,'admin','1234','ผู้ดูแลระบบ'),(2,'manager','5678','ผู้จัดการ')
  const rows = [];
  let i = 0;
  const n = str.length;

  while (i < n) {
    // ข้าม whitespace และ comma
    while (i < n && /[\s,]/.test(str[i])) i++;
    if (i >= n || str[i] !== "(") break;
    i++; // ข้าม '('

    const row = [];
    let val = "";
    let inString = false;
    let wasQuoted = false;

    while (i < n) {
      const c = str[i];

      if (inString) {
        if (c === "\\" && i + 1 < n) {
          const next = str[i + 1];
          const map = { n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", "'": "'", '"': '"' };
          val += map[next] ?? next;
          i += 2;
          continue;
        }
        if (c === "'") {
          // escape แบบ SQL: '' → '
          if (str[i + 1] === "'") {
            val += "'";
            i += 2;
            continue;
          }
          inString = false;
          wasQuoted = true;
          i++;
          continue;
        }
        val += c;
        i++;
        continue;
      }

      if (c === "'") {
        inString = true;
        i++;
        continue;
      }

      if (c === "," || c === ")") {
        const trimmed = val.trim();
        if (wasQuoted) {
          row.push(val); // string เก็บตามจริง (ไม่ trim เพราะ Thai/space อาจสำคัญ)
        } else if (trimmed.toUpperCase() === "NULL" || trimmed === "") {
          row.push(null);
        } else if (/^-?\d+$/.test(trimmed)) {
          row.push(Number(trimmed));
        } else if (/^-?\d+\.\d+$/.test(trimmed)) {
          row.push(Number(trimmed));
        } else {
          row.push(trimmed); // fallback
        }
        val = "";
        wasQuoted = false;

        if (c === ")") {
          i++;
          break;
        }
        i++;
        continue;
      }

      val += c;
      i++;
    }

    rows.push(row);
  }

  return rows;
}

// ---------- 2. Parse SQL dump ----------
function parseSQLDump(sql) {
  const tables = {};

  // หา CREATE TABLE → เก็บชื่อ column ตามลำดับ
  const schemas = {};
  const createRe = /CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\) ENGINE/g;
  let m;
  while ((m = createRe.exec(sql)) !== null) {
    const [, tableName, body] = m;
    const cols = [];
    const colRe = /^\s*`([^`]+)`/gm;
    let cm;
    while ((cm = colRe.exec(body)) !== null) cols.push(cm[1]);
    schemas[tableName] = cols;
  }

  // หา INSERT INTO `table` (col1, col2, ...) VALUES (..),(..);
  const insertRe = /INSERT INTO `([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);\s*(?=\n|$)/g;
  while ((m = insertRe.exec(sql)) !== null) {
    const [, tableName, colsRaw, valuesRaw] = m;

    const cols = colsRaw
      .split(",")
      .map((s) => s.trim().replace(/^`|`$/g, ""));

    const rows = parseValueList(valuesRaw.trim());

    if (!tables[tableName]) tables[tableName] = [];

    for (const row of rows) {
      const obj = {};
      cols.forEach((col, idx) => {
        obj[col] = row[idx] ?? null;
      });
      tables[tableName].push(obj);
    }
  }

  return { tables };
}

// ---------- 3. Main ----------
async function main() {
  console.log("📖 อ่านไฟล์:", SQL_FILE);
  const sql = await fs.readFile(SQL_FILE, "utf-8");

  console.log("🔧 กำลัง parse SQL...");
  const data = parseSQLDump(sql);

  const summary = Object.entries(data.tables)
    .map(([t, rows]) => `  - ${t}: ${rows.length} rows`)
    .join("\n");
  console.log("✅ Parse เสร็จ:\n" + summary);

  console.log("⬆️  กำลังเขียนลง KV key =", KV_KEY);
  await kv.set(KV_KEY, data);

  // อ่านกลับมาตรวจ
  const check = await kv.get(KV_KEY);
  const ok = check && check.tables && Object.keys(check.tables).length > 0;
  console.log(ok ? "🎉 สำเร็จ! ข้อมูลอยู่ใน KV แล้ว" : "❌ ตรวจสอบไม่ผ่าน");
}

main().catch((e) => {
  console.error("💥 Error:", e);
  process.exit(1);
});
