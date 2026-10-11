import mongoose, { Schema } from "mongoose";

const columnSchema = new Schema({
  name: String,
  type: { type: String, enum: ["text", "number", "date", "boolean", "empty"] },
  missing: Number,
  unique: Number
}, { _id: false });

const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  rows: { type: Number, default: 0 },
  columns: { type: Number, default: 0 },
  columnProfile: { type: [columnSchema], default: [] },
  sample: { type: [Schema.Types.Mixed], default: [] },
  selectedSheet: { type: String, default: "" },
  sourceSheets: { type: [Schema.Types.Mixed], default: [] },
  ingestionWarnings: { type: [String], default: [] },
  preparationHistory: { type: [Schema.Types.Mixed], default: [] },
  activeSheetUpdatedAt: { type: Date },
  calculatedColumns: { type: [Schema.Types.Mixed], default: [] },
  calculatedMeasures: { type: [Schema.Types.Mixed], default: [] },
  relationships: { type: [Schema.Types.Mixed], default: [] }
}, { timestamps: true });

export default mongoose.model("Dataset", schema);