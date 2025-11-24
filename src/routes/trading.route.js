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

function convertJsonParamsToString(jsonString) {
  try {
    // Parse chuỗi JSON (bỏ \n, \" ...)
    const arr = JSON.parse(jsonString);

    if (!Array.isArray(arr)) {
      throw new Error("Input không phải là mảng JSON hợp lệ");
    }

    // Lọc ra các phần tử có đủ param & value
    const pairs = arr
      .filter(item => item.param && item.value !== undefined)
      .map(item => `${item.param}=${item.value}`);

    // Ghép thành chuỗi cuối cùng
    return pairs.join(';');
  } catch (err) {
    console.error("❌ Lỗi parse JSON:", err.message);
    return "";
  }
}


// ✅ Route: POST /api/payment
router.get('/', async (req, res) => {
    try {

        // Lấy dữ liệu từ body
        const data = req.query;
        console.log("data: ", data.mail)

        const configs = await databases.listDocuments(
            databaseId,
            "trading",
            [Query.equal("status", true)]
        );
        if (configs.total === 0) {
            return res.status(201).json({
                code: "01",
                success: false,
                message: "config của bạn không tồn tại.",
            });
        }
        const result = configs.documents[0]
         
        const text = convertJsonParamsToString(result.config)
        console.log("config: ", text)
        res.status(201).json(text);
    } catch (error) {
        console.error('❌ Lỗi khi lưu payment:', error.message);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});



export default router;
