const jwt = require("jsonwebtoken");

module.exports = function authContext(req, res, next) {
  // 1. Look for the 'Authorization' header
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Format: "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: "Access Denied: No Token Provided" });
  }

  try {
    // 2. Verify the random token using your secret key
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; // Attach user data to the request
    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid or Expired Token" });
  }
};