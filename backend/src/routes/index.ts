import { Router } from "express";

import authRoutes from "./auth/auth.routes";
import healthRoutes from "./health/health.routes";
import paymentsRoutes from "./payments/payments.routes";
import profileRoutes from "./profile/profile.routes";
import rollsRoutes from "./rolls/rolls.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/me", profileRoutes);
router.use("/rolls", rollsRoutes);
router.use("/payments", paymentsRoutes);

export default router;
