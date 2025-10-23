import express from 'express';
import videoRoute from './routes/video.route.js';
import imageRoute from './routes/image.route.js';
import authRoute from './routes/auth.route.js';
import paymenthRoute from './routes/payment.route.js';
import authChecker from './api/middleware.js'

const router = express.Router();

router.use("/video",authChecker, videoRoute);
router.use("/image",authChecker, imageRoute);
router.use("/auth",authChecker, authRoute);
router.use("/payment",authChecker, paymenthRoute);
router.use("/sepay", paymenthRoute);

export default router;
