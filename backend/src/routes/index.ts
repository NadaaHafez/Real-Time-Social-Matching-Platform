import { Router } from "express";

import adminRoutes from "./admin/admin.routes";
import authRoutes from "./auth/auth.routes";
import chatRoutes from "./chat/chat.routes";
import filtersRoutes from "./filters/filters.routes";
import healthRoutes from "./health/health.routes";
import legalRoutes from "./legal/legal.routes";
import matchmakingRoutes from "./matchmaking/matchmaking.routes";
import paymentsRoutes from "./payments/payments.routes";
import profileRoutes from "./profile/profile.routes";
import rollsRoutes from "./rolls/rolls.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/legal", legalRoutes);
// Before "/me": each router runs requireUser, and a request should pass through only one.
router.use("/me/filters", filtersRoutes);
router.use("/me", profileRoutes);
router.use("/rolls", rollsRoutes);
router.use("/payments", paymentsRoutes);
router.use("/matchmaking", matchmakingRoutes);
router.use("/chat", chatRoutes);
router.use("/admin", adminRoutes);

export default router;
