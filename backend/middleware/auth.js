const jwt = require("jsonwebtoken");
const User = require("../models/user");
const localStore = require("../services/localStore");

async function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Sign in to continue." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = localStore.isLocalMode()
      ? await localStore.findUserById(payload.userId)
      : await User.findById(payload.userId).select("name company email role createdAt");
    if (!user) return res.status(401).json({ message: "Account not found. Please sign in again." });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Your session expired. Please sign in again." });
    }
    return next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Your account type cannot perform this action." });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
