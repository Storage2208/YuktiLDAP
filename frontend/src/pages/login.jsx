import { useState, useEffect } from "react";
import CryptoJS from "crypto-js"; 
import axios from "axios"; 

const API_URL = import.meta.env.VITE_API_URL ;
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || "my_secret_key_123"; 
 
export default function Login({ onLogin }) {
  const [uid, setUid] = useState("");
  const [error, setError] = useState("");
 
  const [captchaSvg, setCaptchaSvg] = useState(""); 
  const [captchaInput, setCaptchaInput] = useState(""); 
 
  useEffect(() => {
  fetch(`${API_URL}/v1/auth/captcha`, {
    credentials: "include"
  })
    .then(res => res.json())
    .then(data => {
      setCaptchaSvg(data.image);
    });
}, []);
 
  const fetchCaptcha = async () => {
    try {
        console.log("Fetching Captcha from:", `${API_URL}/v1/auth/captcha`); 
        const res = await axios.get(`${API_URL}/v1/auth/captcha`, { 
            withCredentials: true 
        });
        setCaptchaSvg(res.data.image);
        setCaptchaInput(""); 
    } catch (err) {
        console.error("Failed to load captcha:", err);
        setError("Could not connect to server. Is Backend running?");
    }
  };
 
  const getDeviceId = () => {
      let deviceId = sessionStorage.getItem("device_id");
      if (!deviceId) {
          deviceId = 'sess-' + Math.random().toString(36).substr(2, 9);
          sessionStorage.setItem("device_id", deviceId);
      }
      return deviceId;
  };
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
 
    if (!captchaInput) { setError("Please enter the verification code."); return; }
 
    try {
      const deviceId = getDeviceId();
 
      //  Send ONLY UID + CAPTCHA (No Password)
      const rawData = { uid, deviceId, captchaValue: captchaInput }; 
 
      const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(rawData), ENCRYPTION_KEY).toString();
 
      const response = await axios.post(`${API_URL}/v1/auth/login`, 
        { payload: ciphertext }, 
        { withCredentials: true } 
      );
 
      const data = response.data;
      if (onLogin) onLogin(data, data.token, data.role, data.allowedOUs, data.canWrite, data.name);
 
    } catch (err) {
      console.error("Login Failed:", err);
      fetchCaptcha(); // Refresh captcha on failure
      setError(err.response?.data?.message || "Login Failed");
    }
  };
 
  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <div className="w-96 p-8 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Admin Login</h2>
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm text-center">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
             <label className="block text-sm font-bold text-gray-700 mb-1">User ID</label>
             <input className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Enter User ID" required />
          </div>
          
          {/* Password Input Field */}

          <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Security Check</label>
              
              {/* CAPTCHA IMAGE BOX */}
              <div className="flex items-center gap-2 mb-3">
                  <div className="grow bg-white border rounded h-12 flex items-center justify-center overflow-hidden" dangerouslySetInnerHTML={{ __html: captchaSvg }} />
                  <button type="button" onClick={fetchCaptcha} className="p-2 text-gray-500 hover:text-blue-600"><i className="pi pi-refresh"></i></button>
              </div>

              <input className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} placeholder="Type characters" required />
          </div>

          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 transition">Sign In</button>
        </form>
      </div>
    </div>
  );
}