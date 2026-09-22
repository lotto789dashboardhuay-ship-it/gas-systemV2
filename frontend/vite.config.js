// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "src/pages/Data.json");

function dataApiMiddleware(req, res, next) {
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
        JSON.parse(body);
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
      configureServer(server) {
        server.middlewares.use("/api/data", dataApiMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use("/api/data", dataApiMiddleware);
      },
    },
  ],
});