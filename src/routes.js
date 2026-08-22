import express from 'express';
import authRoute from './routes/auth.route.js';
import userRoute from './routes/user.route.js';
import toolRoute from './routes/tool.route.js';
import orderRoute from './routes/order.route.js';
import couponRoute from './routes/coupon.route.js';
import paymentRoute from './routes/payment.route.js';
import tradingRoute from './routes/trading.route.js';
import gamRoute from './routes/gam.route.js';
import videoRoute from './routes/video.route.js';
import imageRoute from './routes/image.route.js';
import authChecker from './api/middleware.js';

const router = express.Router();

router.use("/auth", authRoute);
router.use("/users", userRoute);
router.use("/tools", toolRoute);
router.use("/orders", orderRoute);
router.use("/coupons", couponRoute);
router.use("/payment", paymentRoute);
router.use("/sepay", paymentRoute);
router.use("/trading", tradingRoute);
router.use("/gam", gamRoute);

router.use("/video", authChecker, videoRoute);
router.use("/image", authChecker, imageRoute);

export default router;
