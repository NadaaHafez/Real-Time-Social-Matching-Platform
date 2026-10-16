import { Router } from "express";

import authRoutes from "./auth/auth.routes";
import healthRoutes from "./health/health.routes";
import profileRoutes from "./profile/profile.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/me", profileRoutes);

export default router;
