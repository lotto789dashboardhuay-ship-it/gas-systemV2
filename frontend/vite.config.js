// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "src/pages/Data.json");

function dataApiMiddleware(req, res, next) {
  // ตัด prefix ที่ mount มาออก แล้วเช็ค path
  const url = req.url || "";

  if (req.method === "GET") {
    try {
      const raw = fs.existsSync(DATA_FILE)
        ? fs.readFileSync(DATA_FILE, "utf-8")
        : JSON.stringify({ tables: {} });
      res.setHeader("Content-Type", "application/json");
      res.end(raw);
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        JSON.parse(body); // validate
        fs.writeFileSync(DATA_FILE, body, "utf-8");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, savedAt: Date.now() }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  next();
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "data-file-api",
      // ใช้ตอน dev
      configureServer(server) {
        server.middlewares.use("/api/data", dataApiMiddleware);
      },
      // ใช้ตอน vite preview (จำลอง production)
      configurePreviewServer(server) {
        server.middlewares.use("/api/data", dataApiMiddleware);
      },
    },
  ],
});
