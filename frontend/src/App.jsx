import { useState } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import GasPage from "./pages/GasPage"
import DeliveryPage from "./pages/DeliveryPage"
import QRCodePage from "./pages/QRCodePage"
import MaintenancePage from "./pages/MaintenancePage"
import CylinderPage from "./pages/CylinderPage"
import StaffPage from "./pages/StaffPage"
import AdminApprovalPage from "./pages/AdminApprovalPage"
import ProtectedRoute from "./components/ProtectedRoute"

function App() {
  const [customers, setCustomers] = useState([]);
  const [staffs, setStaffs] = useState([])
  const [cylinders, setCylinders] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [maintenances, setMaintenances] = useState([])

  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/* Route สำหรับ Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Dashboard cylinders={cylinders} deliveries={deliveries} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Dashboard cylinders={cylinders} deliveries={deliveries} />
          </ProtectedRoute>
        }
      />

      {/* หน้าจัดการพนักงาน (สำหรับ Admin) */}
      <Route
        path="/staff"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <StaffPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/approval"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminApprovalPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/gas"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <GasPage
              cylinders={cylinders}
              setCylinders={setCylinders}
              deliveries={deliveries}
            />
          </ProtectedRoute>
        }
      />

      {/* หน้าการจัดส่ง (สำหรับทั้ง Admin และ Staff) */}
      <Route
        path="/delivery"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff"]}>
            <DeliveryPage
              deliveries={deliveries}
              setDeliveries={setDeliveries}
              cylinders={cylinders}
              setCylinders={setCylinders}
              staffs={staffs}
              setStaffs={setStaffs}
              customers={customers}
              setCustomers={setCustomers}
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/maintenance"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <MaintenancePage
              cylinders={cylinders}
              setCylinders={setCylinders}
              maintenances={maintenances}
              setMaintenances={setMaintenances}
            />
          </ProtectedRoute>
        }
      />

      <Route path="/cylinder/:id" element={<QRCodePage cylinders={cylinders} />} />

      {/* Catch-all Route: นำทางกลับหน้าแรกเมื่อพิมพ์ Path ที่ไม่มีจริง */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App