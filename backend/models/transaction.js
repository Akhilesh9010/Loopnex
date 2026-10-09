const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    quantity: { type: Number, required: true, min: 0.01 },
    message: { type: String, trim: true, maxlength: 1000, default: "" },
    status: {
      type: String,
      enum: ["requested", "accepted", "rejected", "completed", "cancelled"],
      default: "requested",
      index: true
    }
  },
  { timestamps: true }
);

transactionSchema.index({ listing: 1, buyer: 1 }, { unique: true });

module.exports = mongoose.model("Transaction", transactionSchema);
