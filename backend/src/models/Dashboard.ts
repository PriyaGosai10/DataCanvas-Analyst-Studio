import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true },
  theme: { type: String, default: "light" },
  filters: { type: Schema.Types.Mixed, default: {} },
  blueprint: { type: Schema.Types.Mixed, default: null },
  pages: { type: [Schema.Types.Mixed], default: [{ id: "page-1", name: "Overview" }] }
}, { timestamps: true });

export default mongoose.model("Dashboard", schema);
