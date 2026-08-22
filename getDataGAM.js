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
                const rowObj = {};
                if (row.dimensionValues) {
                    row.dimensionValues.forEach((val, idx) => {
                        const dimName = dimensions[idx];
                        let strVal = (val.stringValue ?? val.intValue ?? val.value ?? '').toString();
                        if (dimName === 'DATE' && strVal.length === 8 && !strVal.includes('-')) {
                            strVal = `${strVal.slice(0, 4)}-${strVal.slice(4, 6)}-${strVal.slice(6, 8)}`;
                        }
                        rowObj[dimName] = strVal;
                    });
                }
                const metricItems = row.metricValues || row.metricValueGroups?.[0]?.primaryValues;
                if (metricItems) {
                    metricItems.forEach((val, idx) => {
                        const metricName = metrics[idx];
                        if (val.currencyValue) {
                            const units = Number(val.currencyValue.units ?? 0);
                            const nanos = Number(val.currencyValue.nanos ?? 0);
                            rowObj[metricName] = units + nanos / 1e9;
                        } else if (val.intValue !== undefined) {
                            rowObj[metricName] = Number(val.intValue);
                        } else if (val.doubleValue !== undefined) {
                            rowObj[metricName] = Number(val.doubleValue);
                        } else {
                            rowObj[metricName] = 0;
                        }
                    });
                }
                allRows.push(rowObj);
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

function mapRowToReportDocs(networkCode, row) {
    const dateRaw =
        row.DATE ?? row.date ?? row.day ?? row.Date ?? row['DATE'] ?? row['date'] ?? row['Date'];
    const adUnitName =
        row.AD_UNIT_NAME ??
        row.ad_unit_name ??
        row['AD_UNIT_NAME'] ??
        row['ad_unit_name'] ??
        row['AD_UNIT'] ??
        row['Ad unit'] ??
        row.adUnitName ?? '';
    const impressionsRaw =
        row.AD_EXCHANGE_IMPRESSIONS ??
        row.IMPRESSIONS ??
        row.impressions ??
        row['AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS'] ??
        row['impr'] ?? 0;
    const site =
        row.Site ??
        row.site ??
        row['SITE'] ??
        row['site'] ??
        row['AD_UNIT'] ??
        row.SITE ?? '';

    const clicksRaw = row.AD_EXCHANGE_CLICKS ?? row.CLICKS ?? row.clicks ?? 0;
    const revenueRaw = row.AD_EXCHANGE_REVENUE ?? row.REVENUE ?? row.revenue ?? 0;
    const ecpmRaw = row.AD_EXCHANGE_ESTIMATED_ECPM ?? row.ECPM ?? row.ecpm ?? 0;

    const onlyDate = (dateRaw ?? '').toString().slice(0, 10);
    const dateObj = onlyDate ? new Date(`${onlyDate}T00:00:00Z`) : new Date();

    return {
        networkCode: String(networkCode),
        date: dateObj,
        site: String(site),
        ad_unit_name: String(adUnitName),
        impressions: Number(impressionsRaw) || 0,
        clicks: Number(clicksRaw) || 0,
        revenue: Number(revenueRaw) || 0,
        ecpm: Number(ecpmRaw) || 0,
        status: 'active',
        options: JSON.stringify(row),
    };
}

// Upsert vào PostgreSQL
async function upsertAdsReport(doc) {
    try {
        const existing = await prisma.adsReport.findFirst({
            where: {
                networkCode: doc.networkCode,
                date: doc.date,
                site: doc.site,
                ad_unit_name: doc.ad_unit_name,
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
                }
            });
        } else {
            return await prisma.adsReport.create({
                data: {
                    id: uuidv4().replace(/-/g, '').slice(0, 20),
                    networkCode: doc.networkCode,
                    date: doc.date,
                    site: doc.site,
                    ad_unit_name: doc.ad_unit_name,
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

async function upsertInBatches(rows, networkCode, batchSize = 50) {
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await Promise.all(
            batch.map(async (row) => {
                const doc = mapRowToReportDocs(networkCode, row);
                await upsertAdsReport(doc);
            })
        );
        console.log(`Ghi dữ liệu: ${Math.min(i + batchSize, rows.length)}/${rows.length} docs`);
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

        for (const doc of codes) {
            const networkCode = doc.networkCode;
            if (!networkCode) continue;

            try {
                console.log(`[CRON] Fetching report for networkCode: ${networkCode}`);
                const rows = await fetchReportForNetworkCode(networkCode, startStr, endStr);

                if (Array.isArray(rows) && rows.length > 0) {
                    console.log(`[CRON] Upserting ${rows.length} rows for ${networkCode}`);
                    await upsertInBatches(rows, networkCode, 50);
                } else {
                    console.log(`[CRON] No data returned for ${networkCode}`);
                }

                await prisma.networkCode.update({
                    where: { id: doc.id },
                    data: { getDataTime: new Date() }
                });
            } catch (err) {
                console.error(`[CRON] Error processing ${networkCode}:`, err.message);
            }
        }
    } catch (e) {
        console.error('[CRON] runOnce error:', e);
    }
}

// Chạy cronjob mỗi giờ
cron.schedule('0 * * * *', async () => {
    console.log(`[CRON] Bắt đầu đồng bộ báo cáo GAM tự động lúc ${new Date().toISOString()}`);
    await runOnce(3);
});

console.log('✅ GAM Reporter Cronjob đã được kích hoạt trên PostgreSQL!');