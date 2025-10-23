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
router.get('/', async (req, res) => {
    try {

        // Lấy dữ liệu từ body
        const data = req.body;

        const configs = await databases.listDocuments(
            databaseId,
            "trading",
            [Query.equal("status", true)]
        );
        if (configs.total === 0) {
            return res.status(201).json({
                code: "01",
                success: false,
                message: "Đơn hàng của bạn không tồn tại.",
            });
        }
        const result = configs.documents[0]
        res.status(201).json(result.config);
    } catch (error) {
        console.error('❌ Lỗi khi lưu payment:', error.message);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});



export default router;
