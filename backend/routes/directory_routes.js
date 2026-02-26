const express = require("express");
const router = express.Router();
const { createClient, bind, search, modify } = require("../services/ldap_services");
const jwt = require("jsonwebtoken");
const multer = require('multer');
const path = require('path');
const { logAction, getSessionLogs, getAuditLogs } = require("../services/logger");
const crypto = require('crypto'); 
const pool = require('../db');
const xlsx = require('xlsx');
const uploadMemory = multer({ storage: multer.memoryStorage() });


// --- HELPER: Build Duplicate Filter ---
const buildDuplicateFilter = (email, mobile, secondaryEmail) => {
    let parts = [];
    if (email) parts.push(`(mail=${email})`);
    if (mobile) parts.push(`(mobile=${mobile})`);
    if (secondaryEmail) parts.push(`(description=${secondaryEmail})`);
    return parts.length > 0 ? `(|${parts.join("")})` : null;
};

// --- HELPER: LDAP Configuration ---
const getOrgBase = () => process.env.LDAP_BASE_DN || "dc=mycompany,dc=com";
const isAllowedOU = (allowed, target) => {
    if (!allowed) return false;
    if (allowed === "ALL") return true;
    if (!target) return false;
    if (!Array.isArray(allowed)) return false;
    
    // Only compare if 'a' exists
    return allowed.some(a => a && a.toString().toLowerCase() === target.toLowerCase());
};

const cleanEntry = (entry) => {
  const cleaned = {};
  for (const [key, value] of Object.entries(entry)) {
    if (value !== undefined && value !== null && value.toString().trim() !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

// Generate SSHA Hash for LDAP (Required for LDAP, but not DB) ---
const generateSSHA = (password) => {
    const salt = crypto.randomBytes(4);
    const sha1 = crypto.createHash('sha1');
    sha1.update(password);
    sha1.update(salt);
    const digest = sha1.digest();
    const result = Buffer.concat([digest, salt]);
    return '{SSHA}' + result.toString('base64');
};

// --- MULTER SETUP ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uid = req.body.uid; 
    const ext = path.extname(file.originalname);
    cb(null, `${uid}${ext}`);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 25 * 1024 } });

// --- MIDDLEWARE ---
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const secret = process.env.JWT_SECRET || "fallback_secret";
    const decoded = jwt.verify(token, secret);
    
    // Safety: If allowedOUs is missing, default to empty array
    if (!decoded.allowedOUs) {
        decoded.allowedOUs = []; 
    } 
    // If it's a single string (not ALL), wrap it in an array
    else if (!Array.isArray(decoded.allowedOUs) && decoded.allowedOUs !== "ALL") {
        decoded.allowedOUs = [decoded.allowedOUs];
    }
    
    req.user = decoded; 
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid Token" });
  }
};

router.use(verifyToken);


// GET LOGS
router.get("/logs/sessions", async (req, res) => {
    if (req.user.role !== "super_admin") return res.status(403).json({ message: "Unauthorized" });
    const logs = await getSessionLogs();
    res.json(logs);
});

router.get("/logs/audits", async (req, res) => {
    if (req.user.role !== "super_admin") return res.status(403).json({ message: "Unauthorized" });
    const logs = await getAuditLogs();
    res.json(logs);
});

// GET OUs
router.get("/ous", async (req, res) => {
  const client = createClient();
  try {
    await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
    
    const entries = await search(client, getOrgBase(), { 
        scope: "one", 
        filter: "(objectClass=organizationalUnit)", 
        attributes: ["ou"] 
    });

    let departments = entries.map(e => Array.isArray(e.ou) ? e.ou[0] : e.ou)
      .filter(name => name && !['users', 'admins', 'system'].includes(name.toLowerCase()));

    // Filter based on permissions
    if (req.user.role !== "super_admin") {
       departments = departments.filter(dept => isAllowedOU(req.user.allowedOUs, dept));
    }
    
    res.json(departments);

  } catch (err) { 
      // ✅ LOG THE ERROR so you can see it in the terminal
      console.error("❌ GET OUs Error:", err); 
      res.status(500).json({ message: "Failed to fetch departments" }); 
  } 
  finally { 
      try { client.unbind(); } catch(e) {} 
  }
});

// GET USERS
router.get("/users/:ou", async (req, res) => {
  const targetOU = req.params.ou;
  if (req.user.role !== "super_admin" && targetOU !== "all" && !isAllowedOU(req.user.allowedOUs, targetOU)) {
      return res.status(403).json({ message: "Unauthorized" });
  }
  const client = createClient();
  try {
    await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
    const users = await search(client, getOrgBase(), {
      scope: "sub", filter: "(objectClass=inetOrgPerson)",
      attributes: ["uid", "cn", "sn", "mail", "description", "title", "employeeType", "mobile", "businessCategory", "departmentNumber", "dn", "createTimeStamp","labeledURI"]
    });

    let cleanUsers = users.map(u => {
        const dnParts = (u.dn || "").split(",");
        const ouPart = dnParts.find(p => p.toLowerCase().startsWith("ou="));
        const cleanDept = ouPart ? ouPart.split("=")[1] : "General";
        return { 
            ...u, 
            department: cleanDept,
            secondaryEmail: Array.isArray(u.description) ? u.description[0] : u.description,
            createTimestamp: Array.isArray(u.createTimestamp) ? u.createTimestamp[0] : u.createTimestamp,
            photoPath: Array.isArray(u.labeledURI) ? u.labeledURI[0] : u.labeledURI 
        };
    });

    if (req.user.role !== "super_admin") {
        cleanUsers = cleanUsers.filter(user => {
            const isAllowed = isAllowedOU(req.user.allowedOUs, user.department);
            return isAllowed;
        });
    }
    res.json(cleanUsers);
  } catch (err) { res.json([]); } 
  finally { client.unbind(); }
});

// 1. ADD USER
router.post("/add", upload.single('photo'), async (req, res) => {
  const { 
    uid, firstName, lastName, email, secondaryEmail,
    password, mobile, title, permissions, department, role 
  } = req.body;

  if (!uid || !department || !password) return res.status(400).json({ message: "Missing fields" });

  if (req.user.role !== "super_admin") {
      if (!req.user.canWrite || !isAllowedOU(req.user.allowedOUs, department)) {
          return res.status(403).json({ message: "Unauthorized" });
      }
  }

  const client = createClient();
  try {
    await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
    
    // Check Global UID
    const existingUid = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})` });
    if (existingUid.length > 0) return res.status(400).json({ message: "UID already exists." });

    // Check Duplicates in Dept
    const dupFilter = buildDuplicateFilter(email, mobile, secondaryEmail);
    if (dupFilter) {
        const duplicates = await search(client, `ou=${department},${getOrgBase()}`, { scope: "sub", filter: dupFilter, attributes: ['uid'] });
        if (duplicates.length > 0) return res.status(400).json({ message: "Email or Mobile already exists in this department." });
    }

    // A. Insert into DB (✅ PLAIN TEXT PASSWORD)
    const newUserDN = `uid=${uid},ou=${department},${getOrgBase()}`;
    const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    
    await pool.query(
        "INSERT INTO ldap_user_mapping (ldap_uid, ldap_pwd, ldap_user_dn, ip_address, is_active) VALUES ($1, $2, $3, $4, TRUE)",
        [uid, password, newUserDN, userIP] 
    );

    // B. Insert into LDAP (Requires SSHA Hash)
    const ldapPassword = generateSSHA(password); 

    const entry = cleanEntry({
      objectClass: ["top", "person", "organizationalPerson", "inetOrgPerson"],
      cn: `${firstName} ${lastName}`, sn: lastName, uid: uid, 
      userPassword: ldapPassword, // LDAP still needs Hash
      employeeType: "active", 
      businessCategory: role || "USER", mail: email, description: secondaryEmail, 
      mobile: mobile, title: title || "Employee", departmentNumber: permissions,
      labeledURI: `uploads/${uid}.jpg` 
    });

    await new Promise((resolve, reject) => {
      client.add(newUserDN, entry, (err) => err ? reject(err) : resolve());
    });

    await logAction(req, "CREATE", uid, role, "ACTIVE", `Created user ${firstName} ${lastName}`);
    res.json({ message: "User created successfully" });

  } catch (err) { 
      console.error("Add Error:", err);
      if (err.code === '23505') return res.status(400).json({ message: "User ID already exists in Database" });
      res.status(500).json({ message: "Server Error" }); 
  } 
  finally { client.unbind(); }
});

// 2. EDIT USER
router.put("/edit", upload.single('photo'), async (req, res) => {
  const { uid, firstName, lastName, email, secondaryEmail, title, mobile, employeeType, permissions, role, password } = req.body; 
  
  if (!uid) return res.status(400).json({ message: "UID required" });

  const client = createClient();
  try {
    await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
    
    // 1. Get User DN First
    const users = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})`, attributes: ["dn"] });
    if (users.length === 0) return res.status(404).json({ message: "User not found" });
    const userDN = users[0].dn;

    // CHECK FOR DUPLICATES 
    const dupFilter = buildDuplicateFilter(email, mobile, secondaryEmail);
    if (dupFilter) {
        const duplicates = await search(client, getOrgBase(), { 
            scope: "sub", 
            filter: dupFilter, 
            attributes: ['uid'] 
        });

        // Check if any duplicate found is NOT the current user
        const conflict = duplicates.find(u => {
            const uID = Array.isArray(u.uid) ? u.uid[0] : u.uid;
            return uID !== uid; 
        });

        if (conflict) {
            return res.status(400).json({ message: `Conflict: Email or Mobile already used by ${conflict.uid}` });
        }
    }

    const ouMatch = userDN.match(/ou=([^,]+)/i);
    const currentOU = ouMatch ? ouMatch[1] : null;

    if (req.user.role !== "super_admin") {
         if (!currentOU || !isAllowedOU(req.user.allowedOUs, currentOU)) {
             return res.status(403).json({ message: "Unauthorized" });
         }
    }

    // 2. Handle Password Change (Sync DB & LDAP)
    if (password && password.trim() !== "") {
        // ✅ UPDATE DB with PLAIN TEXT PASSWORD
        await pool.query("UPDATE ldap_user_mapping SET ldap_pwd = $1, updated_on = NOW() WHERE ldap_uid = $2", [password, uid]);
        
        // LDAP still gets Hash
        const ldapPassword = generateSSHA(password); 
        await modify(client, userDN, 'replace', { userPassword: ldapPassword });
    }

    // 3. Handle Status Change
    if (employeeType) {
        const isActive = (employeeType.toLowerCase() === "active");
        await pool.query("UPDATE ldap_user_mapping SET is_active = $1, updated_on = NOW() WHERE ldap_uid = $2", [isActive, uid]);
    }

    // 4. Update Other LDAP Fields
    const changes = cleanEntry({
      cn: (firstName && lastName) ? `${firstName} ${lastName}` : undefined,
      sn: lastName, mail: email, description: secondaryEmail, 
      title: title, mobile: mobile, employeeType: employeeType,
      businessCategory: role, departmentNumber: permissions,
      labeledURI: req.file ? `uploads/${uid}.jpg` : undefined 
    });

    for (const [key, value] of Object.entries(changes)) {
       try {
        await modify(client, userDN, 'replace', { [key]: value });
       } catch (e) {
         if (e.code === 16 || e.code === 32 || e.message.includes("NoSuchAttribute")) {
            try { await modify(client, userDN, 'add', { [key]: value }); } catch (addErr) {}
         }
       }
    }
    
    await logAction(req, "UPDATE", uid, role, employeeType, `Updated profile details`);
    res.json({ message: "User updated successfully" });

  } catch (err) { 
      console.error("Edit Error:", err);
      res.status(500).json({ message: "Update failed" }); 
  } 
  finally { client.unbind(); }
});
// 3. DELETE USER
router.delete("/delete/:uid", async (req, res) => {
    const { uid } = req.params;

    // 1. Check Permissions
    if (req.user.role !== "super_admin" && !req.user.canWrite) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        // 2. Find User DN in LDAP (Need DN to delete)
        const searchRes = await search(client, getOrgBase(), { 
            scope: "sub", 
            filter: `(uid=${uid})`,
            attributes: ['dn'] 
        });

        // 3. Delete from LDAP
        if (searchRes.length > 0) {
            const userDN = searchRes[0].dn;
            await new Promise((resolve, reject) => {
                client.del(userDN, (err) => err ? reject(err) : resolve());
            });
        }

        // 4. Delete from Database
        await pool.query("DELETE FROM ldap_user_mapping WHERE ldap_uid = $1", [uid]);

        // 5. Log it
        await logAction(req, "DELETE", uid, "ACTIVE", "User deleted permanently");

        res.json({ message: "User deleted successfully" });

    } catch (err) {
        console.error("Delete failed:", err);
        res.status(500).json({ message: "Delete failed" });
    } finally {
        client.unbind();
    }
});

// --- ADD NEW DEPARTMENT (OU) ---
router.post("/add-ou", async (req, res) => {
    const { ouName } = req.body;

    // 1. Strict Authorization: Super Admin Only
    if (req.user.role !== "super_admin") {
        return res.status(403).json({ message: "Unauthorized. Only Super Admins can add departments." });
    }

    if (!ouName) return res.status(400).json({ message: "Department Name is required" });

    // Remove special characters to prevent LDAP injection or invalid DNs
    const cleanName = ouName.trim().replace(/[^a-zA-Z0-9 _-]/g, "");

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        // 2. Define DN (Distinguished Name)
        const newDN = `ou=${cleanName},${getOrgBase()}`;
        
        // 3. Define Entry
        const entry = {
            objectClass: ["top", "organizationalUnit"],
            ou: cleanName
        };

        // 4. Create in LDAP
        await new Promise((resolve, reject) => {
            client.add(newDN, entry, (err) => err ? reject(err) : resolve());
        });

        await logAction(req, "CREATE_OU", "System", "N/A", "ACTIVE", `Created Department: ${cleanName}`);
        
        res.json({ message: "Department created successfully" });

    } catch (err) {
        console.error("Add OU Error:", err);
        if (err.code === 68) return res.status(400).json({ message: "Department already exists" });
        res.status(500).json({ message: "Failed to create department" });
    } finally {
        try { client.unbind(); } catch(e) {}
    }
});

// --- GET OUs WITH USER STATS (For Dashboard) ---
router.get("/ous-stats", async (req, res) => {
    if (req.user.role !== "super_admin") return res.status(403).json({ message: "Unauthorized" });

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        
        // 1. Get All Departments
        const entries = await search(client, getOrgBase(), { 
            scope: "one", filter: "(objectClass=organizationalUnit)", attributes: ["ou"] 
        });
        
        const depts = entries.map(e => Array.isArray(e.ou) ? e.ou[0] : e.ou)
             .filter(name => name && !['users', 'admins', 'system'].includes(name.toLowerCase()));

        // 2. Loop and Calculate Stats
        const stats = [];
        for (const dept of depts) {
            const users = await search(client, `ou=${dept},${getOrgBase()}`, {
                scope: "sub", 
                filter: "(objectClass=inetOrgPerson)", 
                attributes: ["employeeType"] // Fetch status attribute
            });

            let activeCount = 0;
            let inactiveCount = 0;

            users.forEach(u => {
                const status = Array.isArray(u.employeeType) ? u.employeeType[0] : u.employeeType;
                // Check if status is explicitly "ACTIVE" (case-insensitive)
                if (status && status.toString().toUpperCase() === 'ACTIVE') {
                    activeCount++;
                } else {
                    inactiveCount++;
                }
            });

            stats.push({ 
                name: dept, 
                total: users.length, 
                active: activeCount, 
                inactive: inactiveCount 
            });
        }
        
        res.json(stats);
    } catch (err) {
        console.error("Stats Error:", err);
        res.status(500).json({ message: "Error fetching stats" });
    } finally {
        client.unbind();
    }
});

// DELETE OU (Only if empty)
router.delete("/delete-ou/:name", async (req, res) => {
    if (req.user.role !== "super_admin") return res.status(403).json({ message: "Unauthorized" });
    const { name } = req.params;

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        const dn = `ou=${name},${getOrgBase()}`;

        // 1. Check if empty
        const users = await search(client, dn, { scope: "one", filter: "(objectClass=*)" });
        if (users.length > 0) {
            return res.status(400).json({ message: "Cannot delete: Department is not empty" });
        }

        // 2. Delete
        await new Promise((resolve, reject) => {
            client.del(dn, (err) => err ? reject(err) : resolve());
        });

        await logAction(req, "DELETE_OU", "System", "ACTIVE", `Deleted Department: ${name}`);
        res.json({ message: "Department deleted" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Delete failed" });
    } finally {
        client.unbind();
    }
});

// BULK UPLOAD
router.post("/bulk", uploadMemory.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // A. Parse Excel File
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (rawData.length === 0) return res.status(400).json({ message: "Excel file is empty" });

    const client = createClient();
    const summary = { success: 0, failed: 0, errors: [] };

    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        // B. Loop through every row
        for (const [index, row] of rawData.entries()) {
            const rowNum = index + 2; 
            
            // 1. Smart Key Normalization
            const user = {};
            Object.keys(row).forEach(k => {
                const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (cleanKey === 'mobile' || cleanKey === 'mobileno' || cleanKey === 'phone') user.mobile = row[k];
                else if (cleanKey === 'secondaryemail' || cleanKey === 'altemail' || cleanKey === 'description') user.secondaryemail = row[k];
                else if (cleanKey === 'firstname') user.firstname = row[k];
                else if (cleanKey === 'lastname') user.lastname = row[k];
                else user[cleanKey] = row[k];
            });

            if (!user.uid || !user.department || !user.password || !user.firstname || !user.lastname) {
                summary.failed++;
                summary.errors.push(`Row ${rowNum}: Missing required fields`);
                continue;
            }

            // Check Permissions
            if (req.user.role !== "super_admin") {
                if (!isAllowedOU(req.user.allowedOUs, user.department)) {
                    summary.failed++;
                    summary.errors.push(`Row ${rowNum} (${user.uid}): Unauthorized.`);
                    continue; 
                }
            }

            try {
                // 3. Check DB Duplicate
                const dbCheck = await pool.query("SELECT id FROM ldap_user_mapping WHERE ldap_uid = $1", [user.uid]);
                if (dbCheck.rows.length > 0) throw new Error(`UID '${user.uid}' already exists in Database`);

                // 4. ✅ PLAIN TEXT PASSWORD IN DB
                const newUserDN = `uid=${user.uid},ou=${user.department},${getOrgBase()}`;
                const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

                await pool.query(
                    "INSERT INTO ldap_user_mapping (ldap_uid, ldap_pwd, ldap_user_dn, ip_address, is_active) VALUES ($1, $2, $3, $4, TRUE)",
                    [user.uid, user.password, newUserDN, userIP]
                );

                // 5. Insert into LDAP (Needs SSHA Hash)
                const ldapPassword = generateSSHA(user.password);
                
                const entry = cleanEntry({
                    objectClass: ["top", "person", "organizationalPerson", "inetOrgPerson"],
                    cn: `${user.firstname} ${user.lastname}`,
                    sn: user.lastname,
                    uid: user.uid,
                    userPassword: ldapPassword,
                    employeeType: "active",
                    businessCategory: (user.role || "USER").toUpperCase(),
                    mail: user.email,
                    description: user.secondaryemail,
                    mobile: user.mobile ? user.mobile.toString() : undefined,
                    title: user.title || "Employee",
                    departmentNumber: user.permissions ? user.permissions.split(',').map(s=>"ALLOW:"+s.trim()) : undefined,
                    labeledURI: `uploads/${user.uid}.jpg`
                });

                await new Promise((resolve, reject) => {
                    client.add(newUserDN, entry, (err) => err ? reject(err) : resolve());
                });

                summary.success++;

            } catch (err) {
                summary.failed++;
                summary.errors.push(`Row ${rowNum} (${user.uid}): ${err.message}`);
            }
        }
        
        await logAction(req, "BULK_IMPORT", "Batch", "N/A", "ACTIVE", `Imported ${summary.success} users, Failed: ${summary.failed}`);
        res.json({ message: "Bulk import complete", summary });

    } catch (err) {
        console.error("Bulk upload fatal error:", err);
        res.status(500).json({ message: "Server Error during bulk upload" });
    } finally {
        client.unbind();
    }
});
// --- EXPORT USERS ROUTE ---
router.get("/export", async (req, res) => {
    // 1. Check Permissions (Super Admin Only)
    if (req.user.role !== "super_admin" && !req.user.canWrite) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const client = createClient();

    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        // 2. Search LDAP for all users
        const users = await search(client, getOrgBase(), { 
            scope: "sub", 
            filter: "(objectClass=inetOrgPerson)", 
            attributes: ["uid", "cn", "sn", "mail", "mobile", "description", "businessCategory", "dn", "createTimestamp"]
        });

        if (users.length === 0) {
            return res.status(404).json({ message: "No users found to export" });
        }

        // 3. Format Data for Excel
        const data = users.map(u => {
            const dnParts = (u.dn || "").split(",");
            const ouPart = dnParts.find(p => p.toLowerCase().startsWith("ou="));
            const department = ouPart ? ouPart.split("=")[1] : "General";

            const fullName = Array.isArray(u.cn) ? u.cn[0] : u.cn;
            const lastName = Array.isArray(u.sn) ? u.sn[0] : u.sn;
            // Simple logic to get first name
            const firstName = fullName && lastName ? fullName.replace(lastName, "").trim() : fullName;

            return {
                "User ID": Array.isArray(u.uid) ? u.uid[0] : u.uid,
                "First Name": firstName,
                "Last Name": lastName,
                "Department": department,
                "Email": Array.isArray(u.mail) ? u.mail[0] : (u.mail || ""),
                "Secondary Email": Array.isArray(u.description) ? u.description[0] : (u.description || ""),
                "Mobile": Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || ""),
                "Role": Array.isArray(u.businessCategory) ? u.businessCategory[0] : (u.businessCategory || "USER"),
                
            };
        });

        // 4. Create Workbook
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(wb, ws, "Directory Users");

        // 5. Send File Buffer
        const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader("Content-Disposition", "attachment; filename=Directory_Users.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buffer);

        await logAction(req, "EXPORT", "Batch", "ACTIVE", `Exported ${data.length} users`);

    } catch (err) {
        console.error("Export Error:", err);
        res.status(500).json({ message: "Export failed" });
    } finally {
        client.unbind();
    }
});

module.exports = router;