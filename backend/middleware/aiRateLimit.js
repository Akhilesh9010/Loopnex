const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;
const requestsByUser = new Map();

function aiRateLimit(req, res, next) {
  const now = Date.now();
  const key = String(req.user?._id || req.ip || "unknown");
  let entry = requestsByUser.get(key);

  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
  }
  entry.count += 1;
  requestsByUser.set(key, entry);

  if (requestsByUser.size > 10000) {
    for (const [user, value] of requestsByUser) {
      if (now - value.startedAt >= WINDOW_MS) requestsByUser.delete(user);
    }
  }

  if (entry.count > MAX_REQUESTS) {
    res.set("Retry-After", String(Math.ceil((WINDOW_MS - (now - entry.startedAt)) / 1000)));
    return res.status(429).json({ message: "AI listing help is limited to five requests every 15 minutes." });
  }
  return next();
}

module.exports = aiRateLimit;
