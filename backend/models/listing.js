const mongoose = require("mongoose");

const categories = ["Metal", "Chemical", "Plastic", "Industrial", "Other"];

const listingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    material: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, required: true, enum: categories },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    quantity: { type: Number, required: true, min: 0.01 },
    unit: { type: String, required: true, enum: ["kg", "tons", "liters", "pieces"] },
    location: { type: String, required: true, trim: true, maxlength: 160 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["active", "closed"], default: "active", index: true }
  },
  { timestamps: true }
);

listingSchema.index({ status: 1, category: 1, createdAt: -1 });
listingSchema.index({ title: "text", material: "text", description: "text", location: "text" });

module.exports = mongoose.model("Listing", listingSchema);
module.exports.categories = categories;
