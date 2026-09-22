// scripts/seed-blob.mjs
import { put } from "@vercel/blob";
import fs from "node:fs/promises";
import "dotenv/config"; // ถ้ามี

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("ต้องตั้ง BLOB_READ_WRITE_TOKEN ก่อน");
  process.exit(1);
}

const raw = await fs.readFile("src/pages/Data.json", "utf-8");

await put("data.json", raw, {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/json",
  token,
});

console.log("✅ seed data.json ขึ้น Blob สำเร็จ");
