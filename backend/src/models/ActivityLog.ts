import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  projectId: { type: Schema.Types.ObjectId, ref: "Project" },
  action: { type: String, required: true },
  details: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.model("ActivityLog", schema);