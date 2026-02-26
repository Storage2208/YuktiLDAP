import React, { useEffect, useRef, useState } from "react";
import { decryptToken } from "../utils/crypto";
const SECRET_KEY = import.meta.env.VITE_DEPT_SECRET_KEY;
export default function SecureRoute({ children, serviceKey }) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const BASE_URL = import.meta.env.VITE_AUTH_BASE_URL;

  const fetchedRef = useRef(false);
  const redirectRef = useRef(false);

  const redirectToSSO = () => {
    if (!redirectRef.current) {
      redirectRef.current = true;
    //   window.location.href =
    //     "http://localhost:5174/login?sid=account";
    }
  };

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const validateAccess = async () => {
      try {
        // ============================
        // 1️⃣ SERVICE TOKEN CHECK
        // ============================
        const serviceRes = await fetch(
          `${BASE_URL}/service/${serviceKey}/data`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        if (!serviceRes.ok) {
          redirectToSSO();
          return;
        }

        const serviceData = await serviceRes.json();

        if (
          serviceData?.status !== "success" ||
          serviceData?.tokenValid !== true
        ) {
          redirectToSSO();
          return;
        }

        // ============================
        // 2️⃣ TOKEN READ + ROLE CHECK
        // ============================
        const tokenRes = await fetch(
          `${BASE_URL}/auth/token/reads`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "X-Service-Key": serviceKey,
            },
          }
        );

        if (!tokenRes.ok) {
          redirectToSSO();
          return;
        }

        const tokenJson = await tokenRes.json();
        console.log(tokenJson);

        if (!tokenJson.payload) {
          redirectToSSO();
          return;
        }

        // 🔐 decrypt
        const decryptedStr = decryptToken(
          tokenJson.payload,
          SECRET_KEY
        );

        const parsed = JSON.parse(decryptedStr);
        const userData = parsed.data;
 console.log(userData);

        const role = (userData.role || "").toUpperCase();

        if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
          redirectToSSO();
          return;
        }

        // ✅ All checks passed
        setAuthorized(true);
      } catch (err) {
        console.error("Access validation failed", err);
        redirectToSSO();
      } finally {
        setLoading(false);
      }
    };

    validateAccess();
  }, [BASE_URL, serviceKey]);

  if (loading) {
    return (
      <h3 style={{ textAlign: "center", marginTop: "40px" }}>
        Verifying access...
      </h3>
    );
  }

  if (!authorized) return null;

  return children;
}