const express = require("express");
const Feedback = require("../models/feedback");
const feedbackRateLimit = require("../middleware/feedbackRateLimit");
const localStore = require("../services/localStore");

const router = express.Router();
const allowedTypes = ["Suggestion", "Bug report", "General feedback"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/", feedbackRateLimit, async (req, res, next) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  // Quietly accept bot-filled forms without storing the submission.
  if (typeof body.companyWebsite === "string" && body.companyWebsite.trim()) {
    return res.status(201).json({ message: "Thanks for sharing your feedback." });
  }

  const { type, message } = body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ message: "Choose a feedback topic." });
  }
  if (typeof message !== "string" || message.trim().length < 10 || message.trim().length > 3000) {
    return res.status(400).json({ message: "Feedback must be between 10 and 3000 characters." });
  }
  if (email && (email.length > 254 || !emailPattern.test(email))) {
    return res.status(400).json({ message: "Enter a valid email address or leave it blank." });
  }

  const submittedPage = typeof body.page === "string" && body.page.startsWith("/") && !body.page.startsWith("//")
    ? body.page.slice(0, 180)
    : "/";

  try {
    const fields = { type, message: message.trim(), email, page: submittedPage };
    if (localStore.isLocalMode()) await localStore.createFeedback(fields);
    else await Feedback.create(fields);
    return res.status(201).json({ message: "Thanks for sharing your feedback." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
