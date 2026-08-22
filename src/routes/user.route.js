import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import prisma from '../prisma.js';
import authChecker, { adminChecker } from '../api/middleware.js';

const router = express.Router();

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
 * GET /api/users - List all users (Admin only)
 */
router.get('/', authChecker, adminChecker, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return res.json(users.map(formatUserProfile));
    } catch (err) {
        console.error('List users error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy danh sách người dùng.' });
    }
});

/**
 * POST /api/users - Admin create user
 */
router.post('/', authChecker, adminChecker, async (req, res) => {
    try {
        const { name, email, password, role, plan, credits, max_device, subscriptionStatus, expireDate } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Thiếu email người dùng.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });
        if (existing) {
            return res.status(400).json({ message: 'Email đã tồn tại.' });
        }

        const hashedPassword = await bcrypt.hash(password || '12345678', 10);
        const newUser = await prisma.user.create({
            data: {
                id: uuidv4().replace(/-/g, '').slice(0, 20),
                email: normalizedEmail,
                password: hashedPassword,
                name: name || normalizedEmail.split('@')[0],
                role: role || 'user',
                plan: plan || 'free',
                credits: credits !== undefined ? Number(credits) : 10,
                max_device: max_device !== undefined ? Number(max_device) : 1,
                subscriptionStatus: subscriptionStatus || 'trial',
                expireDate: expireDate ? new Date(expireDate) : null
            }
        });

        return res.status(201).json(formatUserProfile(newUser));
    } catch (err) {
        console.error('Create user error:', err);
        return res.status(500).json({ message: 'Lỗi khi tạo người dùng.' });
    }
});

/**
 * GET /api/users/:id - Get user profile
 */
router.get('/:id', authChecker, async (req, res) => {
    try {
        const { id } = req.params;
        const role = (req.user?.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin';
        if (!isAdmin && req.user.id !== id) {
            return res.status(403).json({ message: 'Không có quyền truy cập.' });
        }

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
        }

        return res.json(formatUserProfile(user));
    } catch (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy thông tin người dùng.' });
    }
});

/**
 * PUT /api/users/:id - Update user
 */
router.put('/:id', authChecker, async (req, res) => {
    try {
        const { id } = req.params;
        const isSelf = req.user.id === id;
        const role = (req.user?.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin';

        if (!isSelf && !isAdmin) {
            return res.status(403).json({ message: 'Không có quyền sửa đổi thông tin.' });
        }

        const data = req.body;
        const updateData = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.settings !== undefined) {
            updateData.settings = typeof data.settings === 'object' ? JSON.stringify(data.settings) : data.settings;
        }
        if (data.devices !== undefined && Array.isArray(data.devices)) {
            updateData.devices = data.devices;
        }

        // Các trường chỉ Admin được sửa
        if (isAdmin) {
            if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase();
            if (data.role !== undefined) updateData.role = data.role;
            if (data.plan !== undefined) updateData.plan = data.plan;
            if (data.credits !== undefined) updateData.credits = Number(data.credits);
            if (data.max_device !== undefined) updateData.max_device = Number(data.max_device);
            if (data.subscriptionStatus !== undefined) updateData.subscriptionStatus = data.subscriptionStatus;
            if (data.expireDate !== undefined) updateData.expireDate = data.expireDate ? new Date(data.expireDate) : null;
            if (data.subscriptionEndDate !== undefined) updateData.subscriptionEndDate = data.subscriptionEndDate ? new Date(data.subscriptionEndDate) : null;
            if (data.newPassword) {
                updateData.password = await bcrypt.hash(data.newPassword, 10);
            }
        }

        const updated = await prisma.user.update({
            where: { id },
            data: updateData
        });

        return res.json(formatUserProfile(updated));
    } catch (err) {
        console.error('Update user error:', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật người dùng.' });
    }
});

/**
 * DELETE /api/users/:id - Delete user (Admin only)
 */
router.delete('/:id', authChecker, adminChecker, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id } });
        return res.json({ success: true, message: 'Xóa người dùng thành công.' });
    } catch (err) {
        console.error('Delete user error:', err);
        return res.status(500).json({ message: 'Lỗi khi xóa người dùng.' });
    }
});

export default router;
