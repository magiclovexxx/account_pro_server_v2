// getDataGAM.js
// Chạy mỗi giờ. Node 18+ (có global fetch).

import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomBytes(10).toString('hex');
import prisma from './src/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== Service Account Auth (Google Ad Manager API v1) ======
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, 'account.json');
const GAM_API_BASE = 'https://admanager.googleapis.com/v1';
const GAM_SCOPES = ['https://www.googleapis.com/auth/admanager'];

/**
 * Lấy access token từ Service Account JSON.
 */
async function getServiceAccountToken() {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        throw new Error(`Service account file not found: ${SERVICE_ACCOUNT_PATH}`);
    }
    const keyFile = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
    const auth = new google.auth.GoogleAuth({
        credentials: keyFile,
        scopes: GAM_SCOPES,
    });
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    return tokenResp.token;
}

/**
 * Parse "YYYY-MM-DD" → { year, month, day } cho GAM API dateRange.fixed
 */
function parseDateToObj(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return { year, month, day };
}

/**
 * Lấy Report data từ Google Ad Manager API Beta v1.
 */
async function fetchReportFromGAMApiV1(networkCode, startStr, endStr) {
    const accessToken = await getServiceAccountToken();
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    const dimensions = ['DATE', 'SITE', 'AD_UNIT_NAME'];
    const metrics = [
        'AD_EXCHANGE_IMPRESSIONS',
        'AD_EXCHANGE_CLICKS',
        'AD_EXCHANGE_REVENUE',
        'AD_EXCHANGE_AVERAGE_ECPM',
        'AD_REQUESTS',
        'AD_EXCHANGE_MATCH_RATE',
        'AD_EXCHANGE_CTR',
    ];

    const reportBody = {
        displayName: `Cron Report ${networkCode} ${startStr}~${endStr} ${Date.now()}`,
        reportDefinition: {
            dimensions,
            metrics,
            dateRange: {
                fixed: {
                    startDate: parseDateToObj(startStr),
                    endDate: parseDateToObj(endStr),
                },
            },
            reportType: 'HISTORICAL',
            currencyCode: 'USD',
        },
    };

    console.log(`[GAM v1] Tạo report cho networkCode: ${networkCode} (${startStr} .. ${endStr})`);
    const createResp = await axios.post(
        `${GAM_API_BASE}/networks/${networkCode}/reports`,
        reportBody,
        { headers }
    );

    const reportName = createResp.data.name;
    console.log(`[GAM v1] Report created: ${reportName}`);

    const runResp = await axios.post(
        `${GAM_API_BASE}/${reportName}:run`,
        {},
        { headers }
    );

    const operationName = runResp.data.name;
    console.log(`[GAM v1] Operation created: ${operationName}`);

    let opData;
    let attempts = 0;
    const maxAttempts = 60;
    while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;

        const pollResp = await axios.get(
            `${GAM_API_BASE}/${operationName}`,
            { headers }
        );
        opData = pollResp.data;

        if (opData.done) {
            console.log(`[GAM v1] Report hoàn thành sau ${attempts * 5}s`);
            break;
        }
        console.log(`[GAM v1] Đang chờ report... (${attempts * 5}s)`);
    }

    if (!opData || !opData.done) {
        throw new Error(`[GAM v1] Report timed out sau ${maxAttempts * 5}s`);
    }

    if (opData.error) {
        throw new Error(`[GAM v1] Report failed: ${JSON.stringify(opData.error)}`);
    }

    const resultResource = opData.response?.reportResult || opData.result;
    if (!resultResource) {
        throw new Error(`[GAM v1] Không tìm thấy reportResult trong opData: ${JSON.stringify(opData)}`);
    }

    const allRows = [];
    let pageToken = '';

    do {
        const url = `${GAM_API_BASE}/${resultResource}:fetchRows${
            pageToken ? `?pageToken=${pageToken}` : ''
        }`;
        const fetchResp = await axios.get(url, { headers });
        const data = fetchResp.data;

        if (data.rows && data.rows.length > 0) {
            for (const row of data.rows) {
                const dimVals = row.dimensionValues || [];
                const primaryVals = row.metricValueGroups?.[0]?.primaryValues || [];

                const dimMap = {};
                dimensions.forEach((dim, i) => {
                    const dv = dimVals[i];
                    let strVal = (dv?.stringValue ?? dv?.intValue ?? dv?.doubleValue ?? '').toString();
                    if (dim === 'DATE' && strVal.length === 8 && !strVal.includes('-')) {
                        strVal = `${strVal.slice(0, 4)}-${strVal.slice(4, 6)}-${strVal.slice(6, 8)}`;
                    }
                    dimMap[dim] = strVal;
                });

                const metMap = {};
                metrics.forEach((metric, i) => {
                    const mv = primaryVals[i];
                    if (mv?.currencyValue) {
                        const units = Number(mv.currencyValue.units ?? 0);
                        const nanos = Number(mv.currencyValue.nanos ?? 0);
                        metMap[metric] = units + nanos / 1e9;
                    } else if (mv?.doubleValue !== undefined && mv?.doubleValue !== null) {
                        metMap[metric] = Number(mv.doubleValue);
                    } else if (mv?.intValue !== undefined && mv?.intValue !== null) {
                        metMap[metric] = parseInt(mv.intValue, 10);
                    } else {
                        metMap[metric] = 0;
                    }
                });

                const revenueUsd = metMap['AD_EXCHANGE_REVENUE'] || 0;
                const ecpmUsd = metMap['AD_EXCHANGE_AVERAGE_ECPM'] || 0;

                const obj = {
                    'Date': dimMap['DATE'],
                    'Site': dimMap['SITE'] || '',
                    'Ad unit': dimMap['AD_UNIT_NAME'] || '',
                    'AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS': metMap['AD_EXCHANGE_IMPRESSIONS'] || 0,
                    'AD_EXCHANGE_LINE_ITEM_LEVEL_CLICKS': metMap['AD_EXCHANGE_CLICKS'] || 0,
                    'AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE': Math.round(revenueUsd * 1_000_000),
                    'AD_EXCHANGE_LINE_ITEM_LEVEL_AVERAGE_ECPM': Math.round(ecpmUsd * 1_000_000),
                    'AD_EXCHANGE_LINE_ITEM_LEVEL_CTR': metMap['AD_EXCHANGE_CTR'] || 0,
                    'AD_EXCHANGE_TOTAL_REQUESTS': metMap['AD_REQUESTS'] || 0,
                    'AD_EXCHANGE_MATCH_RATE': metMap['AD_EXCHANGE_MATCH_RATE'] || 0,
                    'AD_EXCHANGE_COST_PER_CLICK': metMap['AD_EXCHANGE_CLICKS'] > 0 ? (revenueUsd / metMap['AD_EXCHANGE_CLICKS']) : 0,
                };
                allRows.push(obj);
            }
        }

        pageToken = data.nextPageToken || '';
    } while (pageToken);

    console.log(`[GAM v1] [${networkCode}] Tổng số rows tải về: ${allRows.length}`);
    return allRows;
}

// ====== Helper: format ngày theo Asia/Bangkok ======
function toBangkokDateString(d) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return fmt.format(d);
}

function getLast3DaysRange(days = 3) {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - days);

    const startStr = toBangkokDateString(start);
    const endStr = toBangkokDateString(end);
    return { startStr, endStr };
}

function parseNumber(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    return Number(String(val).replace(/,/g, '')) || 0;
}

/**
 * Gom nhóm toàn bộ rows theo từng ngày thành các aggregated docs
 * Mỗi document tương ứng với 1 networkCode + 1 ngày, options chứa mảng breakdown chi tiết
 */
function aggregateRows(rows, networkCode) {
    const groups = {};

    for (const row of rows) {
        const dateRaw = row['Date'] ?? row.DATE ?? row.date ?? null;
        if (!dateRaw) continue;

        let dateKey = String(dateRaw).split('T')[0];
        if (dateKey.length === 8 && !dateKey.includes('-')) {
            dateKey = `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
        }

        if (!groups[dateKey]) {
            groups[dateKey] = { rows: [], impressions: 0, clicks: 0, revenueMicros: 0 };
        }

        const g = groups[dateKey];
        const impr = row['AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS'] ?? 0;
        const clicks = row['AD_EXCHANGE_LINE_ITEM_LEVEL_CLICKS'] ?? 0;
        const revMicros = row['AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE'] ?? 0;

        g.rows.push(row);
        g.impressions += parseNumber(impr);
        g.clicks += parseNumber(clicks);
        g.revenueMicros += parseNumber(revMicros);
    }

    const docs = [];
    for (const [date, data] of Object.entries(groups)) {
        const revenueUsd = data.revenueMicros / 1_000_000;
        let ecpmUsd = 0;
        if (data.impressions > 0) {
            ecpmUsd = (revenueUsd / data.impressions) * 1000;
        }

        const ecpmInMicros = Math.round(ecpmUsd * 1_000_000);

        console.log(`[AGG] ${date} | Impr: ${data.impressions} | Rev: $${revenueUsd.toFixed(4)} | eCPM: $${ecpmUsd.toFixed(4)}`);

        let dateObj;
        try {
            dateObj = new Date(`${date}T00:00:00.000Z`);
        } catch (e) {
            dateObj = new Date();
        }

        docs.push({
            networkCode: String(networkCode),
            date: dateObj,
            impressions: data.impressions,
            clicks: data.clicks,
            revenue: data.revenueMicros,
            ecpm: ecpmInMicros,
            options: JSON.stringify(data.rows),
            status: 'active'
        });
    }

    return docs;
}

// Upsert 1 aggregated doc theo networkCode và date
async function upsertAdsReport(doc) {
    try {
        const existing = await prisma.adsReport.findFirst({
            where: {
                networkCode: doc.networkCode,
                date: doc.date,
            }
        });

        if (existing) {
            return await prisma.adsReport.update({
                where: { id: existing.id },
                data: {
                    impressions: doc.impressions,
                    clicks: doc.clicks,
                    revenue: doc.revenue,
                    ecpm: doc.ecpm,
                    options: doc.options,
                    status: doc.status,
                    site: null,
                    ad_unit_name: null,
                }
            });
        } else {
            return await prisma.adsReport.create({
                data: {
                    id: uuidv4().replace(/-/g, '').slice(0, 20),
                    networkCode: doc.networkCode,
                    date: doc.date,
                    impressions: doc.impressions,
                    clicks: doc.clicks,
                    revenue: doc.revenue,
                    ecpm: doc.ecpm,
                    options: doc.options,
                    status: doc.status,
                }
            });
        }
    } catch (err) {
        console.error('Lỗi upsertAdsReport:', err.message);
        return { ok: false, err, doc };
    }
}

async function fetchReportForNetworkCode(networkCode, startStr, endStr) {
    return fetchReportFromGAMApiV1(networkCode, startStr, endStr);
}

export async function runOnce(days = 3) {
    try {
        const codes = await prisma.networkCode.findMany({
            where: { status: true },
            orderBy: { getDataTime: 'asc' }
        });

        if (!codes.length) {
            console.log('No active networkCodes');
            return;
        }

        const { startStr, endStr } = getLast3DaysRange(days);
        console.log(`[CRON] Tất cả ${codes.length} network code(s) | range: ${startStr}..${endStr}`);

        for (const [index, doc] of codes.entries()) {
            const networkCode = doc.networkCode;
            if (!networkCode) continue;

            try {
                console.log(`[CRON] Fetching report for networkCode: ${networkCode} (${index + 1}/${codes.length})`);
                const rows = await fetchReportForNetworkCode(networkCode, startStr, endStr);

                if (!rows || !rows.length) {
                    console.log(`No rows for networkCode=${networkCode}`);
                    continue;
                }

                const aggregatedDocs = aggregateRows(rows, networkCode);
                console.log(`Gộp ${rows.length} rows -> ${aggregatedDocs.length} aggregated docs cho networkCode=${networkCode}`);

                for (const aggDoc of aggregatedDocs) {
                    await upsertAdsReport(aggDoc);
                }

                await prisma.networkCode.update({
                    where: { id: doc.id },
                    data: { getDataTime: new Date() }
                });

                console.log(`✅ Hoàn tất networkCode=${networkCode} (${rows.length} row(s) -> ${aggregatedDocs.length} ngày)`);
            } catch (e) {
                console.error(`[CRON] Error processing ${networkCode}:`, e.message);
            }
        }

        console.log('[CRON] Completed runOnce.');
    } catch (err) {
        console.error('[CRON] Top-level error in runOnce:', err);
    }
}

// Lịch cron: mỗi 5 phút kiểm tra, mỗi 1 giờ quét 7 ngày
let isRunning = false;
let runCount = 0;

cron.schedule('*/5 * * * *', async () => {
    if (isRunning) {
        console.log('⏳ Cron đang chạy, bỏ qua lần này.');
        return;
    }

    isRunning = true;
    console.log('🚀 Bắt đầu cron lúc', new Date().toISOString());

    try {
        runCount++;
        if (runCount % 12 === 0) {
            console.log('--- CHẠY QUÉT 7 NGÀY ---');
            await runOnce(7);
        } else {
            console.log('--- CHẠY QUÉT 2 NGÀY ---');
            await runOnce(2);
        }
    } catch (err) {
        console.error('❌ Lỗi khi chạy runOnce:', err);
    } finally {
        isRunning = false;
        console.log('✅ Cron hoàn tất lúc', new Date().toISOString());
    }
});

console.log("✅ GAM Reporter Cronjob đã được kích hoạt trên PostgreSQL!");