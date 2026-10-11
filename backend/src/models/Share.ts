import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  dashboardId: { type: Schema.Types.ObjectId, ref: "Dashboard", required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  permission: { type: String, enum: ["view"], default: "view" },
  active: { type: Boolean, default: true }
}, { timestamps: true });
export default mongoose.model("Share", schema);
