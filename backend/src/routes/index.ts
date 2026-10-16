import { Router } from "express";

import authRoutes from "./auth/auth.routes";
import healthRoutes from "./health/health.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

export default router;
