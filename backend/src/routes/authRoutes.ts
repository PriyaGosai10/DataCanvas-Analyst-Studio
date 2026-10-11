import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { register, login } from "../controllers/authController";
const router = Router();
router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
export default router;