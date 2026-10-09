const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["Suggestion", "Bug report", "General feedback"]
    },
    message: { type: String, required: true, trim: true, minlength: 10, maxlength: 3000 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    page: { type: String, trim: true, maxlength: 180, default: "/" },
    status: { type: String, enum: ["new", "in_review", "resolved"], default: "new", index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
