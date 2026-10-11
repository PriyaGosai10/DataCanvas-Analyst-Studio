import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  dashboardId: { type: Schema.Types.ObjectId, ref: "Dashboard", required: true, index: true },
  datasetId: { type: Schema.Types.ObjectId, ref: "Dataset", required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  xField: String,
  yField: String,
  aggregation: { type: String, default: "sum" },
  measureId: { type: String, default: "" },
  pageId: { type: String, default: "page-1" },
  position: {
    x: { type: Number, default: 20 },
    y: { type: Number, default: 20 },
    width: { type: Number, default: 360 },
    height: { type: Number, default: 260 }
  },
  style: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export default mongoose.model("Visualization", schema);