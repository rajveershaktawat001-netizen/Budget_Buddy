import express from "express";
import authMiddleware from "../middleware/auth.js";
import { createCheckoutSession } from "../controllers/paymentController.js";

const paymentRouter = express.Router();

paymentRouter.post("/checkout", authMiddleware, createCheckoutSession);

export default paymentRouter;
