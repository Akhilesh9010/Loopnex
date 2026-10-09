const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;
const requestsByIp = new Map();

function feedbackRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || "unknown";
  let entry = requestsByIp.get(key);

  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
  }
  entry.count += 1;
  requestsByIp.set(key, entry);

  if (requestsByIp.size > 10000) {
    for (const [ip, value] of requestsByIp) {
      if (now - value.startedAt >= WINDOW_MS) requestsByIp.delete(ip);
    }
  }

  if (entry.count > MAX_REQUESTS) {
    res.set("Retry-After", String(Math.ceil((WINDOW_MS - (now - entry.startedAt)) / 1000)));
    return res.status(429).json({ message: "Too many feedback submissions. Please try again later." });
  }
  return next();
}

module.exports = feedbackRateLimit;
