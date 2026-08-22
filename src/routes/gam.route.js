import express from 'express';
import axios from 'axios';
import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import prisma from '../prisma.js';
import authChecker from '../api/middleware.js';

const router = express.Router();
const writeFileAsync = promisify(fs.writeFile);

const formatNetworkCode = (nc) => ({
    $id: nc.id,
    $createdAt: nc.createdAt.toISOString(),
    $updatedAt: nc.updatedAt.toISOString(),
    userId: nc.userId,
    networkCode: nc.networkCode,
    title: nc.title || '',
    status: nc.status ?? true,
    profit: nc.profit ?? 0,
    getDataTime: nc.getDataTime ? nc.getDataTime.toISOString() : undefined,
});

const formatAdsReport = (ar) => ({
    $id: ar.id,
    $createdAt: ar.createdAt.toISOString(),
    $updatedAt: ar.updatedAt.toISOString(),
    networkCode: ar.networkCode || '',
    date: ar.date ? ar.date.toISOString() : '',
    ad_unit_name: ar.ad_unit_name || '',
    site: ar.site || '',
    options: ar.options || '',
    status: ar.status || '',
    revenue: ar.revenue ?? 0,
    impressions: ar.impressions ?? 0,
    clicks: ar.clicks ?? 0,
    ecpm: ar.ecpm ?? 0,
});

// ==================== NETWORK CODES API ====================

/**
 * GET /api/gam/network-codes
 */
router.get('/network-codes', authChecker, async (req, res) => {
    try {
        const role = (req.user.role || '').toLowerCase();
        const isPrivileged = role === 'admin' || role === 'superadmin' || role === 'ads';
        const where = isPrivileged ? {} : { userId: req.user.id };
        const codes = await prisma.networkCode.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        return res.json(codes.map(formatNetworkCode));
    } catch (err) {
        console.error('List network codes error:', err);
        return res.status(500).json({ message: 'Lỗi khi lấy danh sách Network Codes.' });
    }
});

/**
 * POST /api/gam/network-codes
 */
router.post('/network-codes', authChecker, async (req, res) => {
    try {
        const { networkCode, title, status, profit } = req.body;
        if (!networkCode) {
            return res.status(400).json({ message: 'Vui lòng cung cấp Network Code.' });
        }

        const newCode = await prisma.networkCode.create({
            data: {
                id: uuidv4().replace(/-/g, '').slice(0, 20),
                userId: req.user.id,
                networkCode: String(networkCode).trim(),
                title: title || '',
                status: status !== undefined ? Boolean(status) : true,
                profit: profit !== undefined ? Number(profit) : 0,
            }
        });
        return res.status(201).json(formatNetworkCode(newCode));
    } catch (err) {
        console.error('Create network code error:', err);
        return res.status(500).json({ message: 'Lỗi khi thêm Network Code.' });
    }
});

/**
 * PUT /api/gam/network-codes/:id
 */
router.put('/network-codes/:id', authChecker, async (req, res) => {
    try {
        const { id } = req.params;
        const { networkCode, title, status, profit } = req.body;
        const updateData = {};

        if (networkCode !== undefined) updateData.networkCode = String(networkCode).trim();
        if (title !== undefined) updateData.title = title;
        if (status !== undefined) updateData.status = Boolean(status);
        if (profit !== undefined) updateData.profit = Number(profit);

        const updated = await prisma.networkCode.update({
            where: { id },
            data: updateData
        });
        return res.json(formatNetworkCode(updated));
    } catch (err) {
        console.error('Update network code error:', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật Network Code.' });
    }
});

/**
 * DELETE /api/gam/network-codes/:id
 */
router.delete('/network-codes/:id', authChecker, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.networkCode.delete({ where: { id } });
        return res.json({ success: true, message: 'Xóa Network Code thành công.' });
    } catch (err) {
        console.error('Delete network code error:', err);
        return res.status(500).json({ message: 'Lỗi khi xóa Network Code.' });
    }
});

// ==================== ADS REPORTS API ====================

/**
 * GET /api/gam/reports
 * Query ads reports with filtering by networkCode, date range, and site
 */
router.get('/reports', authChecker, async (req, res) => {
    try {
        const { networkCode, startDate, endDate, site, limit } = req.query;
        const where = {};

        if (networkCode) {
            const netStr = String(networkCode).trim();
            if (netStr.includes(',')) {
                where.networkCode = { in: netStr.split(',').map(s => s.trim()).filter(Boolean) };
            } else if (netStr && netStr !== 'all') {
                where.networkCode = netStr;
            }
        }

        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                const s = String(startDate).split('T')[0];
                where.date.gte = new Date(`${s}T00:00:00.000Z`);
            }
            if (endDate) {
                const e = String(endDate).split('T')[0];
                where.date.lte = new Date(`${e}T23:59:59.999Z`);
            }
        }

        if (site) {
            where.site = String(site);
        }

        const reports = await prisma.adsReport.findMany({
            where,
            orderBy: { date: 'desc' },
            take: limit ? Math.min(Number(limit), 10000) : 10000
        });

        return res.json(reports.map(formatAdsReport));
    } catch (err) {
        console.error('List ads reports error:', err);
        return res.status(500).json({ message: 'Lỗi khi truy vấn báo cáo quảng cáo.' });
    }
});

// ==================== GAM GOOGLE OAUTH & SYNC HELPERS ====================

async function getRefreshToken({ clientId, clientSecret, redirectUri }) {
    try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const SCOPES = ['https://www.googleapis.com/auth/dfp'];
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'
        });

        return new Promise((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                const parsedUrl = url.parse(req.url, true);
                if (parsedUrl.pathname === new URL(redirectUri).pathname) {
                    const code = parsedUrl.query.code;
                    if (code) {
                        try {
                            const { tokens } = await oauth2Client.getToken(code);
                            res.writeHead(200, { 'Content-Type': 'text/plain' });
                            res.end(`Refresh Token: ${tokens.refresh_token}`);
                            server.close();
                            resolve({
                                success: true,
                                refreshToken: tokens.refresh_token,
                                accessToken: tokens.access_token
                            });
                        } catch (error) {
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end('Error retrieving tokens');
                            server.close();
                            reject(new Error(`Error retrieving tokens: ${error.message}`));
                        }
                    } else {
                        res.writeHead(400, { 'Content-Type': 'text/plain' });
                        res.end('No code provided');
                        server.close();
                        reject(new Error('No code provided'));
                    }
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not found');
                }
            });

            server.listen(6789, () => {
                console.log('Server running on http://localhost:6789');
                console.log('Open this URL in your browser to authenticate:', authUrl);
            });
        });
    } catch (error) {
        console.error('Error in getRefreshToken:', error.message);
        return { success: false, error: error.message };
    }
}

router.post('/auth/get-refresh-token', async (req, res) => {
    try {
        const { clientId, clientSecret, redirectUri } = req.body;
        if (!clientId || !clientSecret || !redirectUri) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        const result = await getRefreshToken({ clientId, clientSecret, redirectUri });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;