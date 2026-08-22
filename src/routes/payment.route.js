import express from 'express';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import dayjs from 'dayjs';
import prisma from '../prisma.js';
import authChecker from '../api/middleware.js';

const router = express.Router();

const formatPayment = (p) => ({
    $id: p.id,
    $createdAt: p.createdAt.toISOString(),
    $updatedAt: p.updatedAt.toISOString(),
    userId: p.userId,
    amount: p.amount ?? 0,
    method: p.method || '',
    transaction: p.transaction || '',
    orderId: p.orderId || '',
    isPurchased: p.isPurchased || '',
    sepayTransaction: p.sepayTransaction || '',
    contentPayment: p.contentPayment || '',
});

/**
 * GET /api/payment - List payments (Admin or user)
 */
router.get('/', authChecker, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const where = isAdmin ? {} : { userId: req.user.id };
        const payments = await prisma.payment.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        return res.json(payments.map(formatPayment));
    } catch (err) {
        console.error('List payments error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy danh sách thanh toán.' });
    }
});

/**
 * POST /api/payment - Create new payment intent
 */
router.post('/', authChecker, async (req, res) => {
    try {
        console.log("📥 Payment data:", req.body);
        const data = req.body;

        if (!data.contentPayment || !data.amount || !data.userId) {
            return res.status(400).json({
                success: false,
                message: "Thiếu dữ liệu bắt buộc: contentPayment, amount, userId",
            });
        }

        const transaction = {
            couponCode: data.couponCode,
            amount: data.amount,
            deviceCount: data.deviceCount,
            toolId: data.toolId,
            package: data.package,
            contentPayment: data.contentPayment,
        };

        const newPayment = await prisma.payment.create({
            data: {
                id: uuidv4().replace(/-/g, '').slice(0, 20),
                userId: data.userId,
                contentPayment: data.contentPayment,
                amount: Number(data.amount),
                isPurchased: "pending",
                method: "sepay",
                transaction: JSON.stringify(transaction),
            }
        });

        console.log("✅ Lưu payment thành công:", newPayment.id);

        return res.status(201).json({
            success: true,
            message: 'Payment saved successfully!',
            data: formatPayment(newPayment),
        });
    } catch (error) {
        console.error('❌ Lỗi khi lưu payment:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

/**
 * POST /api/payment/finish-payment - Check payment status
 */
router.post("/finish-payment", async (req, res) => {
    try {
        const { contentPayment } = req.body;
        console.log("finish-payment body:", req.body);

        const payment = await prisma.payment.findFirst({
            where: { contentPayment }
        });

        if (!payment) {
            return res.status(201).json({
                code: "01",
                success: false,
                message: "Đơn hàng của bạn không tồn tại.",
            });
        }

        console.log("Found payment:", payment);

        if (payment.isPurchased === "success") {
            return res.status(201).json({
                code: "00",
                success: true,
                message: "Bạn đã thanh toán thành công",
            });
        }

        if (payment.isPurchased === "pending") {
            return res.status(201).json({
                code: "01",
                success: false,
                message: "Đơn hàng của bạn chưa thanh toán! Nếu bạn đã thanh toán vui lòng chờ ít phút rồi thử lại.",
            });
        }

        return res.status(201).json({
            code: "02",
            success: false,
            message: "Trạng thái đơn hàng không xác định, vui lòng liên hệ admin.",
        });
    } catch (error) {
        console.error("❌ Lỗi xử lý finish-payment:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi xử lý payment",
            error: error.message,
        });
    }
});

/**
 * POST /api/sepay/payment-return - Webhook Sepay handler
 */
router.post("/payment-return", async (req, res) => {
    try {
        const dataPayment = req.body;
        const { code, transferAmount } = dataPayment;
        console.log("Sepay webhook payload:", dataPayment);

        const payment = await prisma.payment.findFirst({
            where: { contentPayment: code }
        });

        if (!payment) {
            return res.status(200).json({
                success: false,
                message: "Đơn hàng không tồn tại.",
            });
        }

        if (payment.isPurchased === "pending") {
            let transactionObj = {};
            try {
                transactionObj = typeof payment.transaction === 'string' ? JSON.parse(payment.transaction) : payment.transaction;
            } catch (e) {
                console.error("Parse transaction error:", e);
            }

            let amount = parseFloat(transactionObj.amount || payment.amount);
            const newAmount = parseFloat(transactionObj.newAmount || 0);
            if (newAmount > 0 && newAmount < amount) {
                amount = newAmount;
            }

            // Kiểm tra chuyển thiếu tiền
            if (parseFloat(transferAmount) < amount) {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        isPurchased: "not_full",
                        sepayTransaction: JSON.stringify(dataPayment)
                    }
                });

                return res.status(200).json({
                    code: 1001,
                    message: "Bạn thanh toán thiếu, vui lòng liên hệ admin để được trợ giúp.",
                });
            }

            // Lấy tool
            const toolId = transactionObj.toolId;
            const tool = await prisma.tool.findUnique({
                where: { id: toolId }
            });

            if (!tool) {
                return res.status(200).json({ success: false, message: "Công cụ không tồn tại." });
            }

            // Kiểm tra order hiện có
            const existingOrder = await prisma.order.findFirst({
                where: {
                    toolId: tool.id,
                    userId: payment.userId
                }
            });

            let finalOrderId = null;
            const packageDays = transactionObj.package?.days || 30;

            if (existingOrder) {
                let newExpire;
                if (existingOrder.expriration_date && dayjs(existingOrder.expriration_date).isBefore(dayjs())) {
                    newExpire = dayjs().add(packageDays, "day").toDate();
                } else if (existingOrder.expriration_date) {
                    newExpire = dayjs(existingOrder.expriration_date).add(packageDays, "day").toDate();
                } else {
                    newExpire = dayjs().add(packageDays, "day").toDate();
                }

                await prisma.order.update({
                    where: { id: existingOrder.id },
                    data: {
                        expriration_date: newExpire,
                        isPurchased: "true",
                        status: true
                    }
                });
                finalOrderId = existingOrder.id;
            } else {
                const createdOrder = await prisma.order.create({
                    data: {
                        id: uuidv4().replace(/-/g, '').slice(0, 20),
                        userId: payment.userId,
                        toolId: tool.id,
                        paymentId: payment.id,
                        price: Number(transactionObj.package?.price || payment.amount),
                        max_device: Number(transactionObj.deviceCount || 1),
                        status: true,
                        isPurchased: "true",
                        method: "sepay",
                        expriration_date: dayjs().add(packageDays, "day").toDate()
                    }
                });
                finalOrderId = createdOrder.id;
            }

            // Cập nhật coupon
            if (transactionObj.couponCode) {
                const coupon = await prisma.coupon.findUnique({
                    where: { code: transactionObj.couponCode }
                });
                if (coupon && coupon.count < coupon.max_user) {
                    await prisma.coupon.update({
                        where: { id: coupon.id },
                        data: { count: coupon.count + 1 }
                    });
                }
            }

            // Cập nhật payment
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    orderId: finalOrderId,
                    isPurchased: "success",
                    sepayTransaction: JSON.stringify(dataPayment)
                }
            });

            return res.status(200).json({
                success: true,
                message: "Thanh toán thành công!",
            });
        } else {
            return res.status(200).json({
                success: true,
                message: "Đơn hàng đã được thanh toán trước đó.",
            });
        }
    } catch (error) {
        console.error("❌ Lỗi xử lý payment webhook:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
