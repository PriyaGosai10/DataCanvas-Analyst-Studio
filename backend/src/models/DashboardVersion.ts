import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  dashboardId: { type: Schema.Types.ObjectId, ref: "Dashboard", required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  version: { type: Number, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true }
}, { timestamps: true });
export default mongoose.model("DashboardVersion", schema);
