import express from 'express';
import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';

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

    if (!data.orderId || !data.amount || !data.userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu bắt buộc: orderId, amount, userId",
      });
    }
    const transaction = {
            couponCode:data.couponCode,
            amount:data.amount,
            deviceCount:data.deviceCount,
            toolId:data.toolId,
            package:data.package,
            orderId:data.orderId,
            deviceCount:data.deviceCount,
        }
    const dataPayment = {
        userId: data.userId,
        orderId: data.orderId,
        amount: data.amount,
        isPurchased: false,
        method: "sepay",
        transaction: JSON.stringify(transaction),
    }
    // Lưu vào bảng (collection) "payments"
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

export default router;
