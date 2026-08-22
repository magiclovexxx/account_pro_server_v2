import express from 'express';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import prisma from '../prisma.js';
import authChecker, { adminChecker } from '../api/middleware.js';

const router = express.Router();

const formatTool = (t) => ({
    $id: t.id,
    $createdAt: t.createdAt.toISOString(),
    $updatedAt: t.updatedAt.toISOString(),
    userId: t.userId,
    name: t.name || '',
    url: t.url || '',
    username: t.username || '',
    password: t.password || '',
    desc: t.desc || '',
    cookie: t.cookie || '',
    price: t.price ?? 0,
    type: t.type || '',
    status: t.status,
    expriration_date: t.expriration_date ? t.expriration_date.toISOString() : undefined,
    package: t.package || [],
});

/**
 * GET /api/tools - List all tools (active for users, all for admin)
 */
router.get('/', authChecker, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const where = isAdmin ? {} : { status: true };
        const tools = await prisma.tool.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        return res.json(tools.map(formatTool));
    } catch (err) {
        console.error('List tools error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy danh sách tool.' });
    }
});

/**
 * GET /api/tools/:id - Get tool detail
 */
router.get('/:id', authChecker, async (req, res) => {
    try {
        const { id } = req.params;
        const tool = await prisma.tool.findUnique({ where: { id } });
        if (!tool) {
            return res.status(404).json({ message: 'Không tìm thấy tool.' });
        }
        return res.json(formatTool(tool));
    } catch (err) {
        console.error('Get tool error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy thông tin tool.' });
    }
});

/**
 * POST /api/tools - Create tool (Admin only)
 */
router.post('/', authChecker, adminChecker, async (req, res) => {
    try {
        const data = req.body;
        const newTool = await prisma.tool.create({
            data: {
                id: uuidv4().replace(/-/g, '').slice(0, 20),
                userId: req.user.id,
                name: data.name,
                url: data.url,
                username: data.username,
                password: data.password,
                desc: data.desc,
                cookie: data.cookie,
                price: data.price !== undefined ? Number(data.price) : 0,
                type: data.type,
                status: data.status !== undefined ? data.status : true,
                expriration_date: data.expriration_date ? new Date(data.expriration_date) : null,
                package: Array.isArray(data.package) ? data.package : (data.package ? [data.package] : []),
            }
        });
        return res.status(201).json(formatTool(newTool));
    } catch (err) {
        console.error('Create tool error:', err);
        return res.status(500).json({ message: 'Lỗi khi tạo tool.' });
    }
});

/**
 * PUT /api/tools/:id - Update tool (Admin only)
 */
router.put('/:id', authChecker, adminChecker, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const updateData = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.url !== undefined) updateData.url = data.url;
        if (data.username !== undefined) updateData.username = data.username;
        if (data.password !== undefined) updateData.password = data.password;
        if (data.desc !== undefined) updateData.desc = data.desc;
        if (data.cookie !== undefined) updateData.cookie = data.cookie;
        if (data.price !== undefined) updateData.price = Number(data.price);
        if (data.type !== undefined) updateData.type = data.type;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.expriration_date !== undefined) updateData.expriration_date = data.expriration_date ? new Date(data.expriration_date) : null;
        if (data.package !== undefined) updateData.package = Array.isArray(data.package) ? data.package : (data.package ? [data.package] : []);

        const updated = await prisma.tool.update({
            where: { id },
            data: updateData
        });
        return res.json(formatTool(updated));
    } catch (err) {
        console.error('Update tool error:', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật tool.' });
    }
});

/**
 * DELETE /api/tools/:id - Delete tool (Admin only)
 */
router.delete('/:id', authChecker, adminChecker, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.tool.delete({ where: { id } });
        return res.json({ success: true, message: 'Xóa tool thành công.' });
    } catch (err) {
        console.error('Delete tool error:', err);
        return res.status(500).json({ message: 'Lỗi khi xóa tool.' });
    }
});

export default router;
