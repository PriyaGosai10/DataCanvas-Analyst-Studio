import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  status: { type: String, enum: ["active", "archived"], default: "active" }
}, { timestamps: true });

export default mongoose.model("Project", schema);