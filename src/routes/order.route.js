import express from 'express';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import prisma from '../prisma.js';
import authChecker, { adminChecker } from '../api/middleware.js';

const router = express.Router();

const formatOrder = (o) => ({
    $id: o.id,
    $createdAt: o.createdAt.toISOString(),
    $updatedAt: o.updatedAt.toISOString(),
    userId: o.userId,
    toolId: o.toolId,
    orderId: o.orderId || '',
    price: o.price ?? 0,
    type: o.type || '',
    note: o.note || '',
    method: o.method || '',
    isPurchased: o.isPurchased || '',
    expriration_date: o.expriration_date ? o.expriration_date.toISOString() : undefined,
    status: o.status,
    max_device: o.max_device ?? 1,
    devices: o.devices || [],
    paymentId: o.paymentId || undefined,
    user: o.user ? {
        $id: o.user.id,
        name: o.user.name || '',
        email: o.user.email || '',
        phone: o.user.phone || '',
    } : undefined,
    tool: o.tool ? {
        $id: o.tool.id,
        name: o.tool.name || '',
        url: o.tool.url || '',
        cookie: o.tool.cookie || '',
        price: o.tool.price ?? 0,
        type: o.tool.type || '',
        package: o.tool.package || [],
    } : undefined
});

/**
 * GET /api/orders - List orders (admin gets all, user gets own)
 */
router.get('/', authChecker, async (req, res) => {
    try {
        const role = (req.user?.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin';
        const where = isAdmin ? {} : { userId: req.user.id };
        const orders = await prisma.order.findMany({
            where,
            include: { user: true, tool: true },
            orderBy: { createdAt: 'desc' }
        });
        return res.json(orders.map(formatOrder));
    } catch (err) {
        console.error('List orders error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy danh sách đơn hàng.' });
    }
});

/**
 * GET /api/orders/my-tools - Get current user's active tools (for Frontend & Extension)
 */
router.get('/my-tools', authChecker, async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            where: {
                userId: req.user.id,
                status: true
            },
            include: { tool: true },
            orderBy: { createdAt: 'desc' }
        });

        // Trả về danh sách orders kèm tool thông tin
        return res.json(orders.map(formatOrder));
    } catch (err) {
        console.error('Get my-tools error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy danh sách tool của người dùng.' });
    }
});

/**
 * POST /api/orders - Create order
 */
router.post('/', authChecker, async (req, res) => {
    try {
        const data = req.body;
        const role = (req.user?.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin';
        const targetUserId = (isAdmin && data.userId) ? data.userId : req.user.id;

        const newOrder = await prisma.order.create({
            data: {
                id: uuidv4().replace(/-/g, '').slice(0, 20),
                userId: targetUserId,
                toolId: data.toolId,
                orderId: data.orderId || `ORD-${Date.now()}`,
                price: data.price !== undefined ? Number(data.price) : 0,
                type: data.type || '',
                note: data.note || '',
                method: data.method || 'online',
                isPurchased: data.isPurchased || 'true',
                expriration_date: data.expriration_date ? new Date(data.expriration_date) : null,
                status: data.status !== undefined ? data.status : true,
                max_device: data.max_device !== undefined ? Number(data.max_device) : 1,
                devices: Array.isArray(data.devices) ? data.devices : [],
                paymentId: data.paymentId || null
            },
            include: { user: true, tool: true }
        });

        return res.status(201).json(formatOrder(newOrder));
    } catch (err) {
        console.error('Create order error:', err);
        return res.status(500).json({ message: 'Lỗi khi tạo đơn hàng.' });
    }
});

/**
 * PUT /api/orders/:id - Update order
 */
router.put('/:id', authChecker, async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.order.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
        }

        const isOwner = existing.userId === req.user.id;
        const role = (req.user?.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Không có quyền sửa đơn hàng này.' });
        }

        const data = req.body;
        const updateData = {};

        // User có thể cập nhật danh sách thiết bị
        if (data.devices !== undefined && Array.isArray(data.devices)) {
            updateData.devices = data.devices;
        }

        // Admin có thể cập nhật mọi thứ
        if (isAdmin) {
            if (data.status !== undefined) updateData.status = data.status;
            if (data.expriration_date !== undefined) updateData.expriration_date = data.expriration_date ? new Date(data.expriration_date) : null;
            if (data.max_device !== undefined) updateData.max_device = Number(data.max_device);
            if (data.price !== undefined) updateData.price = Number(data.price);
            if (data.note !== undefined) updateData.note = data.note;
            if (data.isPurchased !== undefined) updateData.isPurchased = data.isPurchased;
        }

        const updated = await prisma.order.update({
            where: { id },
            data: updateData,
            include: { user: true, tool: true }
        });

        return res.json(formatOrder(updated));
    } catch (err) {
        console.error('Update order error:', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật đơn hàng.' });
    }
});

/**
 * DELETE /api/orders/:id - Delete order (Admin only)
 */
router.delete('/:id', authChecker, adminChecker, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.order.delete({ where: { id } });
        return res.json({ success: true, message: 'Xóa đơn hàng thành công.' });
    } catch (err) {
        console.error('Delete order error:', err);
        return res.status(500).json({ message: 'Lỗi khi xóa đơn hàng.' });
    }
});

export default router;
