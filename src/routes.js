import express from 'express';
import videoRoute from './routes/video.route.js';
import imageRoute from './routes/image.route.js';
import authRoute from './routes/auth.route.js';
import paymentRoute from './routes/payment.route.js';
import tradingRoute from './routes/trading.route.js';
import gamRoute from './routes/gam.route.js';
import authChecker from './api/middleware.js'

const router = express.Router();

router.use("/video",authChecker, videoRoute);
router.use("/image",authChecker, imageRoute);
router.use("/auth",authChecker, authRoute);
router.use("/gam", gamRoute);
router.use("/payment",authChecker, paymentRoute);
router.use("/sepay", paymentRoute);
router.use("/trading", tradingRoute);

export default router;
