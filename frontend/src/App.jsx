import React, { useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import axios from "axios"; 
import { Tag } from 'primereact/tag'; 
import Login from "./pages/login"; 
import Admin from "./components/admin";
import UserList from "./components/user";
import { Button } from "primereact/button";
import SecureRoute from "./components/SecureRoute";
import AdminLayout from "./components/AdminLayout";

const API_URL = import.meta.env.VITE_API_URL;

export default function App() {

  const navigate = useNavigate(); 

  const [auth, setAuth] = useState(() => {
    const saved = sessionStorage.getItem("auth"); 
    return saved ? JSON.parse(saved) : null;
  });

  // 1. Login Handler
  const handleLogin = (data, token, role, allowedOUs, canWrite, name) => {
    const updatedData = { ...data, token, role, allowedOUs, canWrite, name };
    sessionStorage.setItem("auth", JSON.stringify(updatedData));
    setAuth(updatedData);
    
    //  Send Token in URL on successful login
    if ((role || "").toUpperCase() === "USER") {
        navigate(`/my-directory?token=${token}`);
    } else {
        navigate(`/dashboard?token=${token}`);
    }
  };

const handleLogout = async (e) => {
    if (e && e.preventDefault) e.preventDefault(); 

    const deviceId = sessionStorage.getItem("device_id");

    try {
        if (auth && auth.token) {
            await axios.post(`${API_URL}/api/auth/logout`,
                { deviceId }, 
                { headers: { 'Authorization': `Bearer ${auth.token}` } } 
            );
        }
    } catch (err) {
        console.error("Logout log failed", err);
    } finally {
        sessionStorage.clear(); 
        setAuth(null); 
        navigate("/login");
    }
  };
  
  // const RequireAuth = ({ children }) => (auth ? children : <Navigate to="/login" replace />);
  
  // const RequireAdmin = ({ children }) => {
  //   if (!auth) return <Navigate to="/login" replace />;
    
  //   if ((auth.role || "").toUpperCase() === "USER") {
      
  //       return <Navigate to={`/my-directory?token=${auth.token}`} replace />;
  //   }
  //   return children;
  // };

  return (

    <Routes>
      {/*  Add token to the declarative Route redirects to prevent overwriting */}
      
      {/* <Route 
        path="/login" 
        element={
            !auth ? <Login onLogin={handleLogin} /> : 
            <Navigate to={(auth.role || "").toUpperCase() === "USER" ? `/my-directory?token=${auth.token}` : `/dashboard?token=${auth.token}`} replace />
        } 
      />
      
      <Route path="/" element={<Navigate to={auth ? `/dashboard?token=${auth.token}` : "/login"} replace />} />

     
      <Route
        path="/my-directory"
        element={
          <RequireAuth>
             <div className="p-6 bg-gray-50 min-h-screen">
                <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-600">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">User Dashboard</h1>
                    <p className="text-sm uppercase font-bold text-blue-600">
                        {auth?.allowedOUs?.[0] || "General"} Department
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                     <div className="text-right hidden md:block">
                        <p className="text-xs text-gray-400 uppercase font-bold">Logged in as</p>
                        <div className="flex items-center gap-2 justify-end">
                            <span className="font-bold text-blue-600 text-lg">{auth?.name || "User"}</span>
                            <Tag value={auth?.role} severity="info" />
                        </div>
                     </div>
                     <Button 
                     label="Logout" 
                     onClick={handleLogout} 
                     className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-bold text-sm transition shadow-sm hover:cursor-pointer"/>
                  </div>
                </div>
                <UserList ou={auth?.allowedOUs?.[0]} auth={auth} />
             </div>
          </RequireAuth>
        }
      />

      
      <Route
        path="/dashboard"
        element={
          <RequireAdmin>
             <div className="p-6 bg-gray-50 min-h-screen">
                <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-600">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                      {(auth?.role || "").toUpperCase() === 'SUPER_ADMIN' ? 'Super Admin Dashboard' : 'Admin Dashboard'}
                    </h1>
                    <p className="text-sm text-gray-500">Manage your organization</p>
                  </div>

                  <div className="flex items-center gap-6">
                     <div className="text-right hidden md:block">
                        <p className="text-xs text-gray-400 uppercase font-bold">Logged in as</p>
                        <div className="flex items-center gap-2 justify-end">
                            <span className="font-bold text-blue-600 text-lg">{auth?.name || "User"}</span>
                            <Tag value={auth?.role} severity="info" />
                        </div>
                     </div>
                     <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-bold text-sm transition shadow-sm">
                        Logout
                     </button>
                  </div>
                </div>
                <Admin auth={auth} />
             </div>
          </RequireAdmin>
        }
      /> */}




     <Route
  path="/"
  element={
    <SecureRoute serviceKey="account">
      <AdminLayout auth={auth} handleLogout={handleLogout} />
    </SecureRoute>
  }
/>

<Route
  path="/dashboard"
  element={
    <SecureRoute serviceKey="account">
      <AdminLayout auth={auth} handleLogout={handleLogout} />
    </SecureRoute>
  }
/>



    </Routes>
  );
}