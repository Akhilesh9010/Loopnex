const express = require("express");
const mongoose = require("mongoose");
const Transaction = require("../models/transaction");
const { requireAuth } = require("../middleware/auth");
const localStore = require("../services/localStore");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    if (localStore.isLocalMode()) {
      const transactions = await localStore.findTransactionsForUser(req.user._id);
      return res.json({ transactions });
    }
    const transactions = await Transaction.find({ $or: [{ buyer: req.user._id }, { seller: req.user._id }] })
      .sort({ createdAt: -1 })
      .populate("listing", "title material category quantity unit location status")
      .populate("buyer", "name company email")
      .populate("seller", "name company email");
    res.json({ transactions });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  const validId = localStore.isLocalMode()
    ? /^[0-9a-f-]{36}$/i.test(req.params.id)
    : mongoose.isValidObjectId(req.params.id);
  if (!validId) return res.status(400).json({ message: "Invalid transaction id." });
  const { status } = req.body || {};
  if (!["accepted", "rejected", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ message: "Choose a valid transaction status." });
  }
  try {
    if (localStore.isLocalMode()) {
      const transaction = await localStore.getTransaction(req.params.id);
      if (!transaction) return res.status(404).json({ message: "Transaction not found." });
      const userId = String(req.user._id);
      const isBuyer = transaction.buyer === userId;
      const isSeller = transaction.seller === userId;
      const allowed =
        (isSeller && transaction.status === "requested" && ["accepted", "rejected"].includes(status)) ||
        (isBuyer && transaction.status === "requested" && status === "cancelled") ||
        ((isBuyer || isSeller) && transaction.status === "accepted" && status === "completed");
      if (!allowed) return res.status(403).json({ message: "You cannot make that status change." });
      const updated = await localStore.setTransactionStatus(req.params.id, status);
      return res.json({ message: `Request ${status}.`, transaction: updated });
    }
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: "Transaction not found." });
    const isBuyer = transaction.buyer.equals(req.user._id);
    const isSeller = transaction.seller.equals(req.user._id);
    const allowed =
      (isSeller && transaction.status === "requested" && ["accepted", "rejected"].includes(status)) ||
      (isBuyer && transaction.status === "requested" && status === "cancelled") ||
      ((isBuyer || isSeller) && transaction.status === "accepted" && status === "completed");
    if (!allowed) return res.status(403).json({ message: "You cannot make that status change." });
    transaction.status = status;
    await transaction.save();
    await transaction.populate([
      { path: "listing", select: "title material category quantity unit location status" },
      { path: "buyer", select: "name company email" },
      { path: "seller", select: "name company email" }
    ]);
    res.json({ message: `Request ${status}.`, transaction });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
