import express from 'express';
import { Client, Databases, Query } from 'node-appwrite';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
dotenv.config();
const router = express.Router();

// ✅ Khởi tạo Appwrite Client
const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const databaseId = process.env.APPWRITE_DATABASE_ID;

// ✅ Route: POST /api/payment
router.post('/', async (req, res) => {
    try {
        console.log("📥 Payment data:", req.body);

        // Lấy dữ liệu từ body
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
            contentPayment : data.contentPayment ,
            deviceCount: data.deviceCount,
        }
        const dataPayment = {
            userId: data.userId,
            contentPayment : data.contentPayment ,
            amount: data.amount,
            isPurchased: "pending",
            method: "sepay",
            transaction: JSON.stringify(transaction),
        }
        // Lưu vào bảng (collection) "payments"
        console.log("dataPayment: ", dataPayment)
        const result = await databases.createDocument(
            databaseId,
            'payments', // ⚠️ Tên collection trong Appwrite (phải tồn tại)
            'unique()', // Tự tạo ID document
            dataPayment
        );

        console.log("✅ Lưu thành công:", result.$id);

        res.status(201).json({
            success: true,
            message: 'Payment saved successfully!',
            data: result,
        });
    } catch (error) {
        console.error('❌ Lỗi khi lưu payment:', error.message);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

router.post("/finish-payment", async (req, res) => {
  try {
    const data = req.body;
    const { contentPayment } = data;

    console.log("finish-payment body:", data);

    // 🔍 Tìm payment theo contentPayment (lưu trong transaction)
    const paymentDocs = await databases.listDocuments(
      databaseId,
      "payments",
      [Query.search("contentPayment", contentPayment)]
    );

    if (paymentDocs.total === 0) {
      return res.status(201).json({
        code: "01",
        success: false,
        message: "Đơn hàng của bạn không tồn tại.",
      });
    }

    const payment = paymentDocs.documents[0];
    console.log("Found payment:", payment);

    // Nếu transaction được lưu dưới dạng string, parse ra
    let transaction = {};
    try {
      transaction =
        typeof payment.transaction === "string"
          ? JSON.parse(payment.transaction)
          : payment.transaction;
    } catch (err) {
      console.warn("Không thể parse transaction:", err);
    }

    // 🧠 Xử lý theo trạng thái
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
        message:
          "Đơn hàng của bạn chưa thanh toán! Nếu bạn đã thanh toán vui lòng chờ ít phút rồi thử lại.",
      });
    }

    // Trường hợp khác (ví dụ not_full, failed...)
    return res.status(201).json({
      code: "02",
      success: false,
      message: "Trạng thái đơn hàng không xác định, vui lòng liên hệ admin.",
    });
  } catch (error) {
    console.error("❌ Lỗi xử lý finish-payment:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi xử lý payment",
      error: error.message,
    });
  }
});

// ✅ /api/sepay/payment-return
router.post("/payment-return", async (req, res) => {
    try {
        const dataPayment = req.body;
        const { code, transferAmount } = dataPayment;
        console.log("req.body:", dataPayment);

        // 1️⃣ Tìm payment có transaction.contentPayment == code
        const paymentDocs = await databases.listDocuments(
            databaseId,
            "payments",
            [Query.equal("contentPayment", code)]
        );

        if (paymentDocs.total === 0) {
            return res.status(200).json({
                success: false,
                message: "Đơn hàng không tồn tại.",
            });
        }

        const payment = paymentDocs.documents[0];


        // 2️⃣ Nếu payment đang chờ xử lý
        if (payment.isPurchased === "pending") {
            const updatedPayment = {
                isPurchased: "success",
                sepayTransaction: JSON.stringify(dataPayment),
            };

            let amount = parseFloat(payment.transaction.amount);
            const newAmount = parseFloat(payment.transaction.newAmount || 0);
            if (newAmount > 0 && newAmount < amount) {
                amount = newAmount;
            }

            // Kiểm tra nếu người dùng chuyển thiếu tiền
            if (parseFloat(transferAmount) < amount) {
                updatedPayment.isPurchased = "not_full";
                await databases.updateDocument(databaseId, "payments", payment.$id, updatedPayment);

                return res.status(200).json({
                    code: 1001,
                    message: "Bạn thanh toán thiếu, vui lòng liên hệ admin để được trợ giúp.",
                });
            }

            // 3️⃣ Lấy tool từ listTool
            const transaction = JSON.parse(payment.transaction)
            console.log(" payment.transaction.toolId: ", transaction.toolId)
            const toolDocs = await databases.listDocuments(databaseId, "listTool", [
                Query.equal("$id", transaction.toolId),
            ]);

            if (toolDocs.total === 0) {
                return res.status(200).json({ success: false, message: "Công cụ không tồn tại." });
            }

            const tool = toolDocs.documents[0];

            // 4️⃣ Kiểm tra xem đã có order chưa
            const existingOrders = await databases.listDocuments(databaseId, "orders", [
                Query.equal("toolId", tool.$id),
                Query.equal("userId", payment.userId),
            ]);

            if (existingOrders.total > 0) {
                const existingOrder = existingOrders.documents[0];
                let newExpire;

                if (dayjs(existingOrder.expriration_date).isBefore(dayjs())) {
                    // hết hạn → cộng từ hôm nay
                    newExpire = dayjs().add(transaction.package.days, "day").toISOString();
                } else {
                    // còn hạn → cộng thêm
                    newExpire = dayjs(existingOrder.expriration_date)
                        .add(transaction.package.days, "day")
                        .toISOString();
                }
                await databases.updateDocument(databaseId, "payments", payment.$id, {
                    orderId: existingOrder.$id,
                });
                await databases.updateDocument(databaseId, "orders", existingOrder.$id, {
                    expriration_date: newExpire,
                });
            } else {
                // 5️⃣ Tạo order mới
                const newOrder = {
                    userId: payment.userId,
                    toolId: tool.$id,
                    payment_id: payment.$id,
                    price: parseFloat(transaction.package.price),
                    max_device: parseFloat(transaction.deviceCount),
                    status: "paid",
                    method: "sepay",
                    expriration_date: dayjs()
                        .add(transaction.package.days, "day")
                        .toISOString(),
                    createdAt: new Date().toISOString(),
                };

                const createdOrder = await databases.createDocument(databaseId, "orders", "unique()", newOrder);

                 await databases.updateDocument(databaseId, "payments", payment.$id, {
                    orderId: createdOrder.$id,
                });
            }

            // 6️⃣ Cập nhật coupon (nếu có)
            const couponCode = transaction.couponCode;
            if (couponCode) {
                const coupons = await databases.listDocuments(databaseId, "coupon", [
                    Query.equal("code", couponCode),
                ]);

                if (coupons.total > 0) {
                    const coupon = coupons.documents[0];
                    if (coupon.count < coupon.max_user) {
                        await databases.updateDocument(databaseId, "coupon", coupon.$id, {
                            count: coupon.count + 1,
                        });
                    }
                }
            }

            // 7️⃣ Lưu cập nhật payment
            console.log("✅ updatedPayment:", updatedPayment);
            await databases.updateDocument(databaseId, "payments", payment.$id, updatedPayment);

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
        console.error("❌ Lỗi xử lý payment:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
