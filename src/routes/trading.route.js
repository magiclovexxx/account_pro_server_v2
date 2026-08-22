import express from 'express';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import prisma from '../prisma.js';
import authChecker from '../api/middleware.js';

const router = express.Router();

function convertJsonParamsToString(jsonString) {
    try {
        const arr = JSON.parse(jsonString);
        if (!Array.isArray(arr)) {
            return '';
        }
        const pairs = arr
            .filter(item => item.param && item.value !== undefined)
            .map(item => `${item.param}=${item.value}`);
        return pairs.join(';');
    } catch (err) {
        console.error("❌ Lỗi parse JSON:", err.message);
        return "";
    }
}

const formatTradingConfig = (tc) => ({
    $id: tc.id,
    $createdAt: tc.createdAt.toISOString(),
    $updatedAt: tc.updatedAt.toISOString(),
    userId: tc.userId,
    title: tc.title || '',
    platform: tc.platform || '',
    config: tc.config || '',
    status: tc.status,
    options: tc.options || undefined
});

/**
 * GET /api/trading - Bot parameter string endpoint
 */
router.get('/', async (req, res) => {
    try {
        const config = await prisma.tradingConfig.findFirst({
            where: { status: true }
        });

        if (!config) {
            return res.status(201).json({
                code: "01",
                success: false,
                message: "config của bạn không tồn tại.",
            });
        }

        const text = convertJsonParamsToString(config.config);
        console.log("config text:", text);
        return res.status(201).json(text);
    } catch (error) {
        console.error('❌ Lỗi khi lấy config:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/trading/list - List user's trading configs
 */
router.get('/list', authChecker, async (req, res) => {
    try {
        const configs = await prisma.tradingConfig.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        return res.json(configs.map(formatTradingConfig));
    } catch (error) {
        console.error('List trading configs error:', error);
        return res.status(500).json({ message: 'Lỗi khi lấy danh sách cấu hình.' });
    }
});

/**
 * POST /api/trading/save - Save or update trading config
 */
router.post('/save', authChecker, async (req, res) => {
    try {
        const data = req.body;
        const configId = data.$id || data.id;

        if (configId) {
            const updated = await prisma.tradingConfig.update({
                where: { id: configId },
                data: {
                    title: data.title,
                    platform: data.platform,
                    config: typeof data.config === 'object' ? JSON.stringify(data.config) : data.config,
                    status: data.status !== undefined ? Boolean(data.status) : false,
                    options: typeof data.options === 'object' ? JSON.stringify(data.options) : data.options,
                }
            });
            return res.json(formatTradingConfig(updated));
        } else {
            const created = await prisma.tradingConfig.create({
                data: {
                    id: uuidv4().replace(/-/g, '').slice(0, 20),
                    userId: req.user.id,
                    title: data.title || '',
                    platform: data.platform || '',
                    config: typeof data.config === 'object' ? JSON.stringify(data.config) : (data.config || ''),
                    status: data.status !== undefined ? Boolean(data.status) : false,
                    options: typeof data.options === 'object' ? JSON.stringify(data.options) : data.options,
                }
            });
            return res.status(201).json(formatTradingConfig(created));
        }
    } catch (error) {
        console.error('Save trading config error:', error);
        return res.status(500).json({ message: 'Lỗi khi lưu cấu hình.' });
    }
});

/**
 * DELETE /api/trading/:id - Delete trading config
 */
router.delete('/:id', authChecker, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.tradingConfig.delete({ where: { id } });
        return res.json({ success: true, message: 'Xóa cấu hình thành công.' });
    } catch (error) {
        console.error('Delete trading config error:', error);
        return res.status(500).json({ message: 'Lỗi khi xóa cấu hình.' });
    }
});

export default router;
