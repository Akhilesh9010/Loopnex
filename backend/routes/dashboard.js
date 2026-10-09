const express = require("express");
const Listing = require("../models/listing");
const Transaction = require("../models/transaction");
const { requireAuth } = require("../middleware/auth");
const localStore = require("../services/localStore");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    if (localStore.isLocalMode()) {
      const counts = await localStore.getDashboardCounts(req.user._id, req.user.role);
      return res.json({
        dashboard: {
          ...counts,
          user: {
            id: req.user._id,
            name: req.user.name,
            company: req.user.company,
            email: req.user.email,
            role: req.user.role
          }
        }
      });
    }
    const [activeListings, matches, transactions] = await Promise.all([
      Listing.countDocuments({ owner: req.user._id, status: "active" }),
      req.user.role === "buyer"
        ? Listing.countDocuments({ owner: { $ne: req.user._id }, status: "active" })
        : Promise.resolve(0),
      Transaction.countDocuments({ $or: [{ buyer: req.user._id }, { seller: req.user._id }] })
    ]);
    res.json({
      dashboard: {
        activeListings,
        matches,
        transactions,
        user: {
          id: req.user._id,
          name: req.user.name,
          company: req.user.company,
          email: req.user.email,
          role: req.user.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
