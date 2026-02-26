const pool = require('../db');

// =============================
//   HELPER: Parse User Agent
// =============================
function parseUserAgent(ua) {
    let browserName = "Unknown";
    let browserVersion = "Unknown";
    let platform = "Unknown";

    if (!ua) return { browserName, browserVersion, platform };

    if (ua.includes("Windows")) platform = "Windows";
    else if (ua.includes("Mac")) platform = "MacOS";
    else if (ua.includes("Linux")) platform = "Linux";
    else if (ua.includes("Android")) platform = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) platform = "iOS";

    if (ua.includes("Edg/")) {
        browserName = "Edge";
        browserVersion = ua.split("Edg/")[1].split(" ")[0];
    } else if (ua.includes("Chrome/") && !ua.includes("Edg/")) {
        browserName = "Chrome";
        browserVersion = ua.split("Chrome/")[1].split(" ")[0];
    } else if (ua.includes("Firefox/")) {
        browserName = "Firefox";
        browserVersion = ua.split("Firefox/")[1].split(" ")[0];
    } else if (ua.includes("Safari/") && !ua.includes("Chrome/")) {
        browserName = "Safari";
        browserVersion = ua.split("Version/")[1].split(" ")[0];
    }

    return { browserName, browserVersion, platform };
}

// =============================
// HELPER: Clean IP
// =============================
const cleanIP = (ip) => {
    if (!ip) return "127.0.0.1";
    if (ip === "::1") return "127.0.0.1";
    if (ip.includes("::ffff:")) return ip.replace("::ffff:", "");
    return ip;
};

// =============================
// MAIN LOGGER
// =============================
const logAction = async (req, action, target, details) => {
    try {
        let ldapUid = "SYSTEM";

        if (action === "LOGIN") {
            if (req.body?.uid) ldapUid = req.body.uid;
        } else {
            if (req.user?.uid) ldapUid = req.user.uid;
        }

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const ip = cleanIP(rawIp);

        // ================================
        // AUDIT LOG
        // ================================
        if (["CREATE", "UPDATE", "BULK_IMPORT"].includes(action)) {

            let finalMsg = details || "No details provided";
            if (target && target !== "Batch") {
                finalMsg += ` (Target: ${target})`;
            }

            await pool.query(`
                INSERT INTO ldap_audit_log
                (ldap_uid, ip_address, audit_msg, inserted_on)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            `, [ldapUid, ip, finalMsg]);

            return;
        }

        // ================================
        // SESSION LOG
        // ================================
        const userAgent = req.headers['user-agent'] || "Unknown";
        const { browserName, browserVersion, platform } = parseUserAgent(userAgent);

        const browserId =
            req.body?.deviceId ||
            req.headers['x-device-id'] ||
            "N/A";

        const safeAgent = userAgent.substring(0, 250);

        if (action === "LOGIN") {

            await pool.query(`
                INSERT INTO ldap_user_active_log
                (ldap_uid, ip_address, login_date, login_time, logout_time,
                 browser_id, browser_name, active_time,
                 browser_version, browser_plateform,
                 login_type, browser_agent)
                VALUES (
                    $1,
                    $2,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    NULL,
                    $3,
                    $4,
                    CURRENT_TIMESTAMP,
                    $5,
                    $6,
                    'LOGIN',
                    $7
                )
            `, [
                ldapUid,
                ip,
                browserId,
                browserName,
                browserVersion,
                platform,
                safeAgent
            ]);

        } else if (action === "LOGOUT") {

            await pool.query(`
                UPDATE ldap_user_active_log
                SET logout_time = CURRENT_TIMESTAMP,
                    login_type = 'LOGOUT'
                WHERE browser_id = $1
                AND logout_time IS NULL
            `, [browserId]);
        }

    } catch (err) {
        console.error("LOGGER ERROR:", err.message);
    }
};

// =============================
// SIMPLE RETRIEVAL
// =============================
const getSessionLogs = async () => {
    const result = await pool.query(`
        SELECT * FROM ldap_user_active_log
        ORDER BY id DESC
        LIMIT 1000
    `);
    return result.rows;
};

const getAuditLogs = async () => {
    const result = await pool.query(`
        SELECT * FROM ldap_audit_log
        ORDER BY id DESC
        LIMIT 1000
    `);
    return result.rows;
};

module.exports = { logAction, getSessionLogs, getAuditLogs };
