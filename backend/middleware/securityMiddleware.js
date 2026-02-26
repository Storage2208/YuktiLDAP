const { decryptRequest } = require('../utils/encryption');

const securityMiddleware = (req, res, next) => {
    // 1. ✅ CRITICAL FIX: Skip EVERYTHING if it's a GET request.
    // GET requests have no body, so decryption is impossible/unnecessary.
    if (req.method === 'GET') {
        return next(); // <--- Must return next() to let the request continue!
    }

    // 2. Safety Check: If body is missing/empty on POST/PUT, skip decryption
    if (!req.body || Object.keys(req.body).length === 0) {
        return next();
    }

    // 3. Check for Encryption Fields
    if (!req.body.payload || !req.body.iv || !req.body.key) {
        // It's likely a normal unencrypted JSON request (like Login), just pass it.
        return next(); 
    }

    try {
        // 4. Decrypt
        req.body = decryptRequest(req.body);
        next();
    } catch (err) {
        console.error("Security Decryption Error:", err.message);
        res.status(400).json({ message: "Security handshake failed" });
    }
};

module.exports = securityMiddleware;