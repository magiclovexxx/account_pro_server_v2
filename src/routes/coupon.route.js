import express from 'express';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import prisma from '../prisma.js';
import authChecker, { adminChecker } from '../api/middleware.js';

const router = express.Router();

const formatCoupon = (c) => ({
    $id: c.id,
    $createdAt: c.createdAt.toISOString(),
    $updatedAt: c.updatedAt.toISOString(),
    userId: c.userId,
    title: c.title || '',
    code: c.code,
    desc: c.desc || '',
    percent: c.percent ?? 0,
    percentOfUser: c.percentOfUser ?? 0,
    count: c.count ?? 0,
    max_user: c.max_user ?? 0,
    type: c.type || '',
    reUsed: c.reUsed,
    status: c.status,
    expriration_date: c.expriration_date ? c.expriration_date.toISOString() : undefined,
});

/**
 * GET /api/coupons - List coupons (Admin or active coupons)
 */
router.get('/', authChecker, async (req, res) => {
    try {
        const role = (req.user?.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin';
        const where = isAdmin ? {} : { status: true };
        const coupons = await prisma.coupon.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        return res.json(coupons.map(formatCoupon));
    } catch (err) {
        console.error('List coupons error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy danh sách coupon.' });
    }
});

/**
 * POST /api/coupons/validate - Validate coupon by code
 */
router.post('/validate', authChecker, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ message: 'Vui lòng nhập mã giảm giá.' });
        }

        const coupon = await prisma.coupon.findUnique({
            where: { code: code.trim() }
        });

        if (!coupon || !coupon.status) {
            return res.status(404).json({ message: 'Mã giảm giá không tồn tại hoặc đã bị vô hiệu hóa.' });
        }

        if (coupon.expriration_date && new Date(coupon.expriration_date) < new Date()) {
            return res.status(400).json({ message: 'Mã giảm giá đã hết hạn sử dụng.' });
        }

        if (coupon.max_user > 0 && coupon.count >= coupon.max_user) {
            return res.status(400).json({ message: 'Mã giảm giá đã đạt số lượt sử dụng tối đa.' });
        }

        return res.json(formatCoupon(coupon));
    } catch (err) {
        console.error('Validate coupon error:', err);
        return res.status(500).json({ message: 'Lỗi khi kiểm tra mã giảm giá.' });
    }
});

/**
 * POST /api/coupons - Create coupon (Admin only)
 */
router.post('/', authChecker, adminChecker, async (req, res) => {
    try {
        const data = req.body;
        if (!data.code) {
            return res.status(400).json({ message: 'Mã coupon không được để trống.' });
        }

        const existing = await prisma.coupon.findUnique({
            where: { code: data.code.trim() }
        });
        if (existing) {
            return res.status(400).json({ message: 'Mã giảm giá đã tồn tại.' });
        }

        const newCoupon = await prisma.coupon.create({
            data: {
                id: uuidv4().replace(/-/g, '').slice(0, 20),
                userId: req.user.id,
                title: data.title || '',
                code: data.code.trim(),
                desc: data.desc || '',
                percent: data.percent !== undefined ? Number(data.percent) : 0,
                percentOfUser: data.percentOfUser !== undefined ? Number(data.percentOfUser) : 0,
                count: data.count !== undefined ? Number(data.count) : 0,
                max_user: data.max_user !== undefined ? Number(data.max_user) : 0,
                type: data.type || '',
                reUsed: data.reUsed !== undefined ? Boolean(data.reUsed) : false,
                status: data.status !== undefined ? Boolean(data.status) : true,
                expriration_date: data.expriration_date ? new Date(data.expriration_date) : null,
            }
        });
        return res.status(201).json(formatCoupon(newCoupon));
    } catch (err) {
        console.error('Create coupon error:', err);
        return res.status(500).json({ message: 'Lỗi khi tạo mã giảm giá.' });
    }
});

/**
 * PUT /api/coupons/:id - Update coupon (Admin only)
 */
router.put('/:id', authChecker, adminChecker, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const updateData = {};

        if (data.title !== undefined) updateData.title = data.title;
        if (data.code !== undefined) updateData.code = data.code.trim();
        if (data.desc !== undefined) updateData.desc = data.desc;
        if (data.percent !== undefined) updateData.percent = Number(data.percent);
        if (data.percentOfUser !== undefined) updateData.percentOfUser = Number(data.percentOfUser);
        if (data.count !== undefined) updateData.count = Number(data.count);
        if (data.max_user !== undefined) updateData.max_user = Number(data.max_user);
        if (data.type !== undefined) updateData.type = data.type;
        if (data.reUsed !== undefined) updateData.reUsed = Boolean(data.reUsed);
        if (data.status !== undefined) updateData.status = Boolean(data.status);
        if (data.expriration_date !== undefined) updateData.expriration_date = data.expriration_date ? new Date(data.expriration_date) : null;

        const updated = await prisma.coupon.update({
            where: { id },
            data: updateData
        });
        return res.json(formatCoupon(updated));
    } catch (err) {
        console.error('Update coupon error:', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật mã giảm giá.' });
    }
});

/**
 * DELETE /api/coupons/:id - Delete coupon (Admin only)
 */
router.delete('/:id', authChecker, adminChecker, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.coupon.delete({ where: { id } });
        return res.json({ success: true, message: 'Xóa mã giảm giá thành công.' });
    } catch (err) {
        console.error('Delete coupon error:', err);
        return res.status(500).json({ message: 'Lỗi khi xóa mã giảm giá.' });
    }
});

export default router;
