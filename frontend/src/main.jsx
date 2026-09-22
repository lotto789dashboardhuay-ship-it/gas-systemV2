import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import "./index.css" // 🟢 เพิ่มบรรทัดนี้เพื่อดึงฟอนต์ Prompt เข้ามาใช้ทั้งระบบ

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)