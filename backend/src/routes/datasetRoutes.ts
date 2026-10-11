import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import multer from "multer";
import path from "path";
import { auth } from "../middleware/auth";
import { uploadDataset, listDatasets, getDataset, deleteDataset, changeDatasetSheet, previewDatasetPreparation, applyDatasetPreparation, undoDatasetPreparation, saveSemanticModel, getSheetColumns } from "../controllers/datasetController";
import { env } from "../config/env";
const router = Router();
const upload = multer({
  dest: path.resolve(process.cwd(), env.uploadDir),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [".csv", ".xlsx", ".xls"].includes(path.extname(file.originalname).toLowerCase());
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV and Excel files are supported"));
    }
  }
});
router.use(auth);
router.post("/upload", upload.single("file"), asyncHandler(uploadDataset));
router.get("/project/:projectId", asyncHandler(listDatasets));
router.get("/:id", asyncHandler(getDataset));
router.post("/:id/sheet", asyncHandler(changeDatasetSheet));
router.post("/:id/preparation/preview", asyncHandler(previewDatasetPreparation));
router.post("/:id/preparation/apply", asyncHandler(applyDatasetPreparation));
router.post("/:id/preparation/undo", asyncHandler(undoDatasetPreparation));
router.put("/:id/semantic-model", asyncHandler(saveSemanticModel));
router.get("/:id/sheets/:sheetName/columns", asyncHandler(getSheetColumns));
router.delete("/:id", asyncHandler(deleteDataset));
export default router;
