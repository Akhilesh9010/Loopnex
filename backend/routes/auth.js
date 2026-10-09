const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { requireAuth } = require("../middleware/auth");
const localStore = require("../services/localStore");

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, company, email, password, role } = req.body || {};

    if (!name || !company || !email || !password || !role) {
      return res.status(400).json({
        message: "Please fill in all fields."
      });
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return res.status(400).json({
        message: "Password must be at least 8 characters."
      });
    }

    if (!["generator", "buyer", "logistics"].includes(role)) {
      return res.status(400).json({
        message: "Invalid account type."
      });
    }

    if ([name, company, email].some((value) => typeof value !== "string")) {
      return res.status(400).json({ message: "Name, company, and email must be text." });
    }

    const cleanName = name.trim();
    const cleanCompany = company.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanCompany || cleanName.length > 100 || cleanCompany.length > 120) {
      return res.status(400).json({ message: "Name or company is empty or too long." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    const existingUser = localStore.isLocalMode()
      ? await localStore.findUserByEmail(normalizedEmail)
      : await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "This email is already registered."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const userFields = {
      name: cleanName,
      company: cleanCompany,
      email: normalizedEmail,
      password: hashedPassword,
      role
    };
    const user = localStore.isLocalMode()
      ? await localStore.createUser(userFields)
      : await User.create(userFields);

    return res.status(201).json({
      message: "Registration successful!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "This email is already registered." });
    }
    console.error("Registration error:", error.message);
    return res.status(500).json({
      message: "Registration failed. Please try again."
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password must be text." });
    }
    const user = localStore.isLocalMode()
      ? await localStore.findUserByEmail(email.trim().toLowerCase())
      : await User.findOne({ email: email.trim().toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.json({
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        company: user.company,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Login failed. Please try again."
    });
  }
});

router.get("/me", requireAuth, (req, res) => {
  const { _id, name, company, email, role, createdAt } = req.user;
  res.json({ user: { id: _id, name, company, email, role, createdAt } });
});

module.exports = router;
