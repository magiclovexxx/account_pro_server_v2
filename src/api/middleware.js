import { Client, Account } from "node-appwrite";
/**
 * 🔒 Auth Checker Middleware
 * Kiểm tra cookie chứa token hợp lệ hay không
 */

export default async (req, res, next) => {
    const authHeader = req.headers.authorization;
  console.log("authHeader:  ", authHeader)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization header không hợp lệ.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Khởi tạo Appwrite Client phía server
        const client = new Client()
            .setEndpoint(process.env.APPWRITE_ENDPOINT) // 'https://appwrite.kingoftool.net/v1'
            .setProject(process.env.APPWRITE_PROJECT_ID) // '68f158230025f534f88a'
            .setJWT(token); // Quan trọng: set JWT để xác thực

        const account = new Account(client);
        
        // Yêu cầu Appwrite xác minh token và lấy thông tin người dùng
        const user = await account.get();

        // Gắn thông tin người dùng vào request để các route sau có thể sử dụng
        req.user = user; 
        console.log("auth ok")
        next(); // Token hợp lệ, cho phép đi tiếp
    } catch (error) {
        console.error('Lỗi xác thực token:', error.message);
        return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
}
