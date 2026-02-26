const express = require("express");
const router = express.Router();
const { createClient, bind, search } = require("../services/ldap_services");
const jwt = require("jsonwebtoken");
const CryptoJS = require("crypto-js"); 
const { logAction } = require("../services/logger");
const ENCRYPTION_KEY = "my_secret_key_123"; 
const bcrypt = require('bcrypt');
const pool = require('../db');
const axios = require('axios');
const svgCaptcha = require('svg-captcha'); 

// --- TOKEN VERIFICATION MIDDLEWARE ---
const verifyToken = (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret");
        req.user = decoded;
        next();
    } catch (err) {
        res.status(403).json({ message: "Invalid Token" });
    }
};

// --- DECRYPTION MIDDLEWARE ---
const decryptPayload = (req, res, next) => {
    if (req.body && req.body.payload) {
        try {
            console.log("Decrypting payload...");
            const bytes = CryptoJS.AES.decrypt(req.body.payload, ENCRYPTION_KEY);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
            
            if (!decryptedString) throw new Error("Decryption result empty");

            const decryptedData = JSON.parse(decryptedString);
            req.body = decryptedData; 
        } catch (err) {
            console.error("Decryption Failed:", err.message);
            return res.status(400).json({ message: "Security Error: Invalid Payload" });
        }
    }
    next();
};

// --- ACCESS CONTEXT RESOLUTION ---
function resolveAccessContext(data) {
  try {
    const dn = (data.dn || "").toLowerCase();
    
    let rawRole = data.businessCategory || "USER";
    if (Array.isArray(rawRole)) rawRole = rawRole[0]; 
    const systemRole = rawRole.toString().toUpperCase();

    if (systemRole === "SUPER_ADMIN") {
        return { role: "super_admin", allowedOUs: "ALL", canWrite: true };
    }

    const deptMatch = dn.match(/ou=([^,]+),dc=/i); 
    const homeDept = deptMatch ? deptMatch[1] : null; 

    if (homeDept) {
      let permArray = [];
      if (Array.isArray(data.departmentNumber)) {
          permArray = data.departmentNumber;
      } else if (data.departmentNumber) {
          permArray = [data.departmentNumber];
      }

      let allowedOUs = []; 
      const allowTag = permArray.find(s => s && s.toString().startsWith("ALLOW:"));
      
      if (allowTag) {
          const listStr = allowTag.split("ALLOW:")[1];
          allowedOUs = listStr.split(",").map(s => s.trim());
      }

      if (systemRole === "MANAGER" || systemRole === "ADMIN") {
        return { role: "ou_admin", allowedOUs: allowedOUs, canWrite: true };
      }
      return { role: "user", allowedOUs: [homeDept], canWrite: false };
    }
    return { role: "user", allowedOUs: [], canWrite: false };

  } catch (err) {
    console.error("Error resolving access context:", err);
    return { role: "user", allowedOUs: [], canWrite: false };
  }
}

// --- CAPTCHA ROUTE ---
router.get("/captcha", (req, res) => {
    const captcha = svgCaptcha.create({
        size: 5,
        noise: 2,
        color: true,
        background: '#f0f0f0'
    });

    req.session.captcha = captcha.text.toLowerCase();
    res.status(200).json({
        image: captcha.data
    });
});

// --- LOGIN ROUTE ---
router.post("/login", decryptPayload, async (req, res) => {
  console.log(`[Server] POST /api/auth/login`);

  const { uid, captchaValue } = req.body || {};
  if (!uid) return res.status(400).json({ message: "Missing UID" });

  // 1. CAPTCHA CHECK
  if (!req.session.captcha || req.session.captcha !== captchaValue?.toLowerCase()) {
    return res.status(400).json({ message: "Incorrect CAPTCHA" });
  }
  req.session.captcha = null;

  const adminClient = createClient();

  try {
    // 2. CHECK DB
    const dbResult = await pool.query(
      "SELECT ldap_pwd FROM ldap_user_mapping WHERE ldap_uid = $1 AND is_active = TRUE AND is_deleted = FALSE",
      [uid]
    );

    if (dbResult.rows.length === 0) return res.status(401).json({ message: "User not found in DB" });
    const storedPassword = dbResult.rows[0].ldap_pwd;

    // 3. ADMIN BIND (To fetch roles)
    await bind(adminClient, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

    const searchResult = await search(adminClient, process.env.LDAP_BASE_DN, {
      scope: "sub",
      filter: `(uid=${uid})`,
      attributes: ["dn", "businessCategory", "departmentNumber", "cn"]
    });

    if (searchResult.length === 0) return res.status(404).json({ message: "User not in LDAP" });

    const userRecord = searchResult[0];
    const userDN = userRecord.dn;

    console.log("------------------------------------------------");
    console.log(`🔍 LOGGING IN: ${uid}`);
    console.log(`   Role Found: ${userRecord.businessCategory}`);
    console.log(`   Raw Permissions:`, userRecord.departmentNumber);

    // 4. USER BIND (Verify Password)
    const userClient = createClient();
    try {
      await bind(userClient, userDN, storedPassword);
      userClient.unbind();
    } catch (err) {
      userClient.unbind();
      console.log(" Password Validation Failed");
      return res.status(401).json({ message: "Invalid Credentials" });
    }

    // 5. RESOLVE PERMISSIONS
    const access = resolveAccessContext({
      dn: userDN,
      businessCategory: userRecord.businessCategory,
      departmentNumber: userRecord.departmentNumber
    });

    console.log(` FINAL ACCESS: Role=${access.role}, AllowedOUs=${JSON.stringify(access.allowedOUs)}`);

    if (access.role === "user") return res.status(403).json({ message: "Unauthorized" });

    // 6. GENERATE TOKEN
    const token = jwt.sign(
      { uid, role: access.role, allowedOUs: access.allowedOUs, canWrite: access.canWrite },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "8h" }
    );

    const userName = Array.isArray(userRecord.cn) ? userRecord.cn[0] : (userRecord.cn || uid);

    res.json({
      token,
      name: userName,
      role: access.role,
      allowedOUs: access.allowedOUs,
      canWrite: access.canWrite
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    adminClient.unbind();
  }
});


// --- LOGOUT ROUTE ---
router.post("/logout", verifyToken, async (req, res) => {
    try {
        const uid = req.user.uid;
        const role = req.user.role || "USER";

        await logAction(req, "LOGOUT", uid, role, "ACTIVE", "User logged out manually");
        
        res.json({ message: "Logout logged successfully" });
    } catch (err) {
        console.error("Logout Log Failed:", err);
        res.status(500).json({ message: "Error logging logout" });
    }
});

module.exports = router;