import axios from "axios";
import { encryptData } from "./utils/encryption"; // Import the helper

const API_URL = `${import.meta.env.VITE_API_URL}/v1`;

// Helper to send Encrypted Requests
const postEncrypted = async (url, data, auth = null) => {
  const encryptedBody = encryptData(data); // 🔒 Encrypt here
  const headers = auth ? { Authorization: `Bearer ${auth.token}` } : {};
  return axios.post(url, encryptedBody, { headers });
};

const putEncrypted = async (url, data, auth = null) => {
  const encryptedBody = encryptData(data); // 🔒 Encrypt here
  const headers = auth ? { Authorization: `Bearer ${auth.token}` } : {};
  return axios.put(url, encryptedBody, { headers });
};

// 1. LOGIN (Now Encrypted)
export const login = async (credentials) => {
  const response = await postEncrypted(`${API_URL}/auth/login`, credentials);
  return response.data;
};

// 2. Add User (Now Encrypted)
export const addUser = async (userData, auth) => {
  const response = await postEncrypted(`${API_URL}/directory/add`, userData, auth);
  return response.data;
};

// 3. Edit User (Now Encrypted)
export const editUser = async (userData, auth) => {
  const response = await putEncrypted(`${API_URL}/directory/edit`, userData, auth);
  return response.data;
};

// 4. Get Departments (No body, so no encryption needed)
export const getOUs = async (auth) => {
  const response = await axios.get(`${API_URL}/directory/ous`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });
  return response.data;
};

// 5. Get Users
export const getUsersByOU = async (ou, auth, timestamp) => {
  const url = `${API_URL}/directory/users/${ou}?t=${timestamp || Date.now()}`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });
  return response.data;
};