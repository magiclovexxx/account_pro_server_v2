import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';

/**
 * 🔒 Auth Checker Middleware
 * Xác thực Bearer JWT Token và gắn `req.user` vào request
 */
export default async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization header không hợp lệ hoặc thiếu Token.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const secret = process.env.JWT_SECRET || 'account_pro_jwt_secret_key_2026_981273918237';
        const decoded = jwt.verify(token, secret);

        if (!decoded || !decoded.id) {
            return res.status(401).json({ message: 'Token không hợp lệ.' });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.id }
        });

        if (!user) {
            return res.status(401).json({ message: 'Người dùng không tồn tại hoặc đã bị xóa.' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Lỗi xác thực JWT:', error.message);
        return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
};

/**
 * 👑 Admin Checker Middleware
 */
export const adminChecker = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Truy cập bị từ chối: Yêu cầu quyền Quản trị viên.' });
    }
    next();
};
