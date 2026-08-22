import express from 'express';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import prisma from '../prisma.js';
import authChecker from '../api/middleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'account_pro_jwt_secret_key_2026_981273918237';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Hỗ trợ xác thực cả mật khẩu mã hóa bằng Argon2 (từ Appwrite cũ) và Bcrypt (mới)
 */
async function verifyPassword(plainPassword, hashedPassword) {
    if (!hashedPassword || !plainPassword) return false;
    if (hashedPassword.startsWith('$argon2')) {
        try {
            return await argon2.verify(hashedPassword, plainPassword);
        } catch (e) {
            return false;
        }
    }
    try {
        return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (e) {
        return false;
    }
}

const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Helper để format profile trả về client khớp 100% UserProfile type
const formatUserProfile = (user) => ({
    $id: user.id,
    $createdAt: user.createdAt.toISOString(),
    $updatedAt: user.updatedAt.toISOString(),
    userId: user.id,
    email: user.email,
    name: user.name || '',
    phone: user.phone || '',
    subscriptionStatus: user.subscriptionStatus || 'trial',
    subscriptionEndDate: user.subscriptionEndDate ? user.subscriptionEndDate.toISOString() : undefined,
    expireDate: user.expireDate ? user.expireDate.toISOString() : undefined,
    plan: user.plan || 'free',
    credits: user.credits ?? 10,
    role: user.role || 'user',
    settings: user.settings || undefined,
    usage: user.usage || undefined,
    max_device: user.max_device ?? 1,
    devices: user.devices || [],
});

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Vui lòng cung cấp email và mật khẩu.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });

        if (existing) {
            return res.status(400).json({ message: 'Email này đã được đăng ký.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                id: uuidv4().replace(/-/g, '').slice(0, 20), // 20 ký tự như Appwrite ID
                email: normalizedEmail,
                name: name ? name.trim() : normalizedEmail.split('@')[0],
                password: hashedPassword,
                plan: 'free',
                role: 'user',
                subscriptionStatus: 'trial',
                credits: 10,
                max_device: 1,
            }
        });

        const token = generateToken(newUser);
        return res.status(201).json({
            token,
            user: formatUserProfile(newUser)
        });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ message: 'Lỗi máy chủ khi đăng ký tài khoản.' });
    }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Vui lòng cung cấp email và mật khẩu.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });

        if (!user) {
            return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
        }

        if (user.password) {
            const isMatch = await verifyPassword(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
            }
        }

        const token = generateToken(user);
        return res.json({
            token,
            user: formatUserProfile(user)
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: 'Lỗi máy chủ khi đăng nhập.' });
    }
});

/**
 * POST /api/auth/google
 */
router.post('/google', async (req, res) => {
    try {
        const { email, name, sub } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Thiếu thông tin Google user.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        let user = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    id: uuidv4().replace(/-/g, '').slice(0, 20),
                    email: normalizedEmail,
                    name: name || normalizedEmail.split('@')[0],
                    plan: 'free',
                    role: 'user',
                    subscriptionStatus: 'trial',
                    credits: 10,
                    max_device: 1,
                }
            });
        }

        const token = generateToken(user);
        return res.json({
            token,
            user: formatUserProfile(user)
        });
    } catch (err) {
        console.error('Google login error:', err);
        return res.status(500).json({ message: 'Lỗi máy chủ khi xác thực Google.' });
    }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authChecker, async (req, res) => {
    try {
        return res.json({
            user: formatUserProfile(req.user)
        });
    } catch (err) {
        console.error('Auth me error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy thông tin người dùng.' });
    }
});

/**
 * POST /api/auth/update-profile
 */
router.post('/update-profile', authChecker, async (req, res) => {
    try {
        const { name, phone, settings } = req.body;
        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                ...(name !== undefined && { name }),
                ...(phone !== undefined && { phone }),
                ...(settings !== undefined && {
                    settings: typeof settings === 'object' ? JSON.stringify(settings) : settings
                })
            }
        });
        return res.json({
            user: formatUserProfile(updated)
        });
    } catch (err) {
        console.error('Update profile error:', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật thông tin cá nhân.' });
    }
});

/**
 * POST /api/auth/update-password
 */
router.post('/update-password', authChecker, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' });
        }

        if (req.user.password && oldPassword) {
            const isMatch = await verifyPassword(oldPassword, req.user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Mật khẩu cũ không chính xác.' });
            }
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: req.user.id },
            data: { password: hashedPassword }
        });

        return res.json({ message: 'Đổi mật khẩu thành công.' });
    } catch (err) {
        console.error('Update password error:', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật mật khẩu.' });
    }
});

export default router;