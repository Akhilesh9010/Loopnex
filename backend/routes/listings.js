const express = require("express");
const mongoose = require("mongoose");
const Listing = require("../models/listing");
const Transaction = require("../models/transaction");
const { requireAuth, requireRole } = require("../middleware/auth");
const localStore = require("../services/localStore");

const router = express.Router();
const units = ["kg", "tons", "liters", "pieces"];
const categories = ["Metal", "Chemical", "Plastic", "Industrial", "Other"];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function validId(id) {
  return localStore.isLocalMode() ? /^[0-9a-f-]{36}$/i.test(id) : mongoose.isValidObjectId(id);
}

function listingInput(body, partial = false) {
  const fields = ["title", "material", "category", "description", "quantity", "unit", "location"];
  const input = {};
  for (const field of fields) {
    if (body[field] !== undefined) input[field] = body[field];
  }
  const required = ["title", "material", "category", "description", "quantity", "unit", "location"];
  if (!partial && required.some((field) => input[field] === undefined)) {
    return { error: "Complete all listing fields." };
  }
  for (const field of ["title", "material", "category", "description", "unit", "location"]) {
    if (input[field] !== undefined && (typeof input[field] !== "string" || !input[field].trim())) {
      return { error: `${field} must be a non-empty text value.` };
    }
    if (typeof input[field] === "string") input[field] = input[field].trim();
  }
  if (input.quantity !== undefined && (!Number.isFinite(Number(input.quantity)) || Number(input.quantity) <= 0)) {
    return { error: "Quantity must be greater than zero." };
  }
  if (input.quantity !== undefined) input.quantity = Number(input.quantity);
  if (input.unit !== undefined && !units.includes(input.unit)) {
    return { error: "Unit must be kg, tons, liters, or pieces." };
  }
  if (input.category !== undefined && !categories.includes(input.category)) {
    return { error: "Choose a valid material category." };
  }
  if (input.title && input.title.length > 100) return { error: "Title is too long." };
  if (input.material && input.material.length > 100) return { error: "Material is too long." };
  if (input.description && input.description.length > 2000) return { error: "Description is too long." };
  if (input.location && input.location.length > 160) return { error: "Location is too long." };
  return { input };
}

router.get("/", async (req, res, next) => {
  try {
    const query = { status: "active" };
    if (req.query.category && req.query.category !== "All Categories") {
      query.category = req.query.category;
    }
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const pattern = new RegExp(escapeRegex(req.query.search.trim().slice(0, 80)), "i");
      query.$or = ["title", "material", "description", "location", "category"].map((field) => ({ [field]: pattern }));
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    if (localStore.isLocalMode()) {
      const result = await localStore.findListings({
        category: query.category,
        search: typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "",
        page,
        limit
      });
      return res.json({ listings: result.listings, page, limit, total: result.total });
    }
    const [items, total] = await Promise.all([
      Listing.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("owner", "name company role")
        .lean(),
      Listing.countDocuments(query)
    ]);
    res.json({ listings: items, page, limit, total });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid listing id." });
  try {
    if (localStore.isLocalMode()) {
      const listing = await localStore.findListingById(req.params.id);
      if (!listing || listing.status !== "active") return res.status(404).json({ message: "Listing not found." });
      return res.json({ listing });
    }
    const listing = await Listing.findById(req.params.id).populate("owner", "name company role");
    if (!listing || listing.status !== "active") return res.status(404).json({ message: "Listing not found." });
    res.json({ listing });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, requireRole("generator"), async (req, res, next) => {
  const { input, error } = listingInput(req.body || {});
  if (error) return res.status(400).json({ message: error });
  try {
    if (localStore.isLocalMode()) {
      const listing = await localStore.createListing(input, req.user._id);
      return res.status(201).json({ message: "Listing published.", listing });
    }
    const listing = await Listing.create({ ...input, owner: req.user._id });
    await listing.populate("owner", "name company role");
    res.status(201).json({ message: "Listing published.", listing });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAuth, requireRole("generator"), async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid listing id." });
  const { input, error } = listingInput(req.body || {}, true);
  if (error) return res.status(400).json({ message: error });
  if (!Object.keys(input).length) return res.status(400).json({ message: "Provide at least one listing field to update." });
  try {
    if (localStore.isLocalMode()) {
      const listing = await localStore.updateListing(req.params.id, req.user._id, input);
      if (!listing) return res.status(404).json({ message: "Active listing not found." });
      return res.json({ message: "Listing updated.", listing });
    }
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id, status: "active" },
      { $set: input },
      { new: true, runValidators: true }
    ).populate("owner", "name company role");
    if (!listing) return res.status(404).json({ message: "Active listing not found." });
    res.json({ message: "Listing updated.", listing });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, requireRole("generator"), async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid listing id." });
  try {
    if (localStore.isLocalMode()) {
      const listing = await localStore.updateListing(req.params.id, req.user._id, {}, "closed");
      if (!listing) return res.status(404).json({ message: "Active listing not found." });
      return res.json({ message: "Listing closed." });
    }
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id, status: "active" },
      { $set: { status: "closed" } },
      { new: true }
    );
    if (!listing) return res.status(404).json({ message: "Active listing not found." });
    res.json({ message: "Listing closed." });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/interest", requireAuth, requireRole("buyer"), async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid listing id." });
  const requestedQuantity = Number(req.body?.quantity);
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (message.length > 1000) return res.status(400).json({ message: "Message must be under 1000 characters." });
  try {
    if (localStore.isLocalMode()) {
      const listing = await localStore.findListingById(req.params.id);
      if (!listing || listing.status !== "active") return res.status(404).json({ message: "Listing is no longer available." });
      if (listing.owner?._id === String(req.user._id)) return res.status(400).json({ message: "You cannot request your own listing." });
      const quantity = Number.isFinite(requestedQuantity) && requestedQuantity > 0 ? requestedQuantity : listing.quantity;
      if (quantity > listing.quantity) return res.status(400).json({ message: "Requested quantity exceeds the available amount." });
      const transaction = await localStore.createTransaction({
        listingId: listing._id,
        buyerId: req.user._id,
        quantity,
        message
      });
      return res.status(201).json({ message: "Your request was sent to the generator.", transaction });
    }
    const listing = await Listing.findOne({ _id: req.params.id, status: "active" });
    if (!listing) return res.status(404).json({ message: "Listing is no longer available." });
    if (listing.owner.equals(req.user._id)) return res.status(400).json({ message: "You cannot request your own listing." });
    const quantity = Number.isFinite(requestedQuantity) && requestedQuantity > 0 ? requestedQuantity : listing.quantity;
    if (quantity > listing.quantity) return res.status(400).json({ message: "Requested quantity exceeds the available amount." });
    const transaction = await Transaction.create({
      listing: listing._id,
      buyer: req.user._id,
      seller: listing.owner,
      quantity,
      message
    });
    res.status(201).json({ message: "Your request was sent to the generator.", transaction });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "You have already requested this listing." });
    next(error);
  }
});

module.exports = router;
