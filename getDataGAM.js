// cron-ads-report.mjs
// Chạy mỗi giờ. Node 18+ (có global fetch).

import { Client, Databases, Query, ID } from 'node-appwrite';
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import axios from 'axios';
// (Tuỳ chọn) Tải biến môi trường từ .env
// import 'dotenv/config';


const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY
const APPWRITE_ADS_REPORT_COLLECTION_ID = 'adsReport'
const APPWRITE_NETWORK_CODES_COLLECTION_ID = 'networkCodes'
const BASE_REPORT_URL = 'https://account.pro.vn/python-api/gam/report';
// const BASE_REPORT_URL = 'http://42.96.15.241:5000/gam/report';


const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

const databases = new Databases(client);
let x = []
// console.log("APPWRITE_ENDPOINT: ", APPWRITE_ENDPOINT)
// Hàm upsert song song an toàn theo batch
async function upsertInBatches(rows, networkCode, batchSize = 100) {
    let failList = [];

    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        const results = await Promise.all(
            batch.map(async (row) => {
                const doc = mapRowToReportDocs(networkCode, row);

                try {
                    await upsertAdsReport(databases, doc);
                    return { ok: true };
                } catch (err) {
                    return { ok: false, err, doc };
                }
            })
        );
        console.log(`Ghi dữ liệu: ${i + batchSize}/${rows.length} docs`);
    }

    return failList;
}


// Helper: Concurrency Pool
async function runConcurrent(items, concurrency, fn) {
    const results = [];
    const executing = [];
    for (const item of items) {
        const p = fn(item).then(res => {
            executing.splice(executing.indexOf(p), 1);
            return res;
        });
        results.push(p);
        executing.push(p);
        if (executing.length >= concurrency) {
            await Promise.race(executing);
        }
    }
    return Promise.all(results);
}

async function createDocsConcurrent(docs, concurrency = 50) {
    let successCount = 0;
    await runConcurrent(docs, concurrency, async (doc) => {
        try {
            await databases.createDocument(
                APPWRITE_DATABASE_ID,
                APPWRITE_ADS_REPORT_COLLECTION_ID,
                ID.unique(),
                doc
            );
            successCount++;
        } catch (err) {
            console.error('Create error:', err);
        }
    });
    console.log(`Đã tạo (${docs.length > 0 ? docs[0].status : ''}): ${successCount}/${docs.length}`);
    return successCount;
}

async function updateStatusConcurrent(documents, newStatus, concurrency = 100) {
    let count = 0;
    await runConcurrent(documents, concurrency, async (doc) => {
        try {
            await databases.updateDocument(
                APPWRITE_DATABASE_ID,
                APPWRITE_ADS_REPORT_COLLECTION_ID,
                doc.$id,
                { status: newStatus }
            );
            count++;
        } catch (err) {
            console.error('Update status error:', err);
        }
    });
    console.log(`Đã update status='${newStatus}': ${count}/${documents.length}`);
}

async function deleteConcurrent(documents, concurrency = 100) {
    let count = 0;
    await runConcurrent(documents, concurrency, async (doc) => {
        try {
            await databases.deleteDocument(
                APPWRITE_DATABASE_ID,
                APPWRITE_ADS_REPORT_COLLECTION_ID,
                doc.$id
            );
            count++;
        } catch (err) {
            console.error('Delete error:', err);
        }
    });
    console.log(`Đã xoá: ${count}/${documents.length}`);
}

function nowUtcIso() {
    return new Date().toISOString(); // ví dụ: 2025-11-04T03:100:22.123Z
}

// Hoặc nếu bạn muốn lưu rõ múi giờ Bangkok (+07:00)
function nowBangkokIso() {
    const now = new Date();
    // Lấy các phần theo giờ địa phương Bangkok bằng cách cộng offset 7h từ UTC
    const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const Y = bangkok.getUTCFullYear();
    const M = pad(bangkok.getUTCMonth() + 1);
    const D = pad(bangkok.getUTCDate());
    const h = pad(bangkok.getUTCHours());
    const m = pad(bangkok.getUTCMinutes());
    const s = pad(bangkok.getUTCSeconds());
    return `${Y}-${M}-${D}T${h}:${m}:${s}+07:00`;
}

// ====== Helper: format ngày theo Asia/Bangkok ======
function formatTime(d) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return fmt.format(d); // YYYY-MM-DD
}

// Trả về 3 ngày gần nhất (theo Bangkok): [today-2 .. today]
function getLast3DaysRange(day) {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - day);

    const startStr = formatTime(start);
    const endStr = formatTime(end);
    return { startStr, endStr };
}




// Chuẩn hoá dữ liệu hàng từ API thành record cho adsReport
function mapRowToReportDocs(networkCode, row) {
    // console.log("Map row ", networkCode, row)
    const dateRaw =
        row.DATE ?? row.date ?? row.day ?? row.Date ?? row['DATE'] ?? row['date'] ?? row['Date'];
    const adUnitName =
        row.AD_UNIT_NAME ??
        row.ad_unit_name ??
        row['AD_UNIT_NAME'] ??
        row['ad_unit_name'] ??
        row['AD_UNIT'] ??
        row['Ad unit'] ??
        row.adUnitName;
    const impressionsRaw =
        row.IMPRESSIONS ??
        row.impressions ??
        row['IMPRESSIONS'] ??
        row['impressions'] ??
        row['impr'];
    const site =
        row.Site ??
        row.site ??
        row['SITE'] ??
        row['site'] ??
        row['AD_UNIT'] ??
        row.SITE;

    delete row['Ad unit'];
    delete row['Site'];
    delete row['Date'];

    const option = {

    }
    // const onlyDate = (dateRaw ?? '').toString().slice(0, 100);
    // const isoDate = `${onlyDate}T00:00:00-08:00`;

    const impressions = impressionsRaw != null ? Number(impressionsRaw) : 0;

    return {
        networkCode: String(networkCode),
        date: dateRaw,
        // site: site, // removed
        // ad_unit_name: adUnitName ? String(adUnitName) : '', // removed
        options: JSON.stringify(row), // Full row details
    };
}

function parseNumber(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    return Number(String(val).replace(/,/g, '')) || 0;
}

function aggregateRows(rows, networkCode) {
    const groups = {};

    for (const row of rows) {
        if (Object.keys(groups).length === 0 && groups.constructor === Object) {
            console.log("DEBUG FIRST ROW KEYS:", JSON.stringify(row, null, 2));
        }
        // Extract Date
        const dateRaw = row.DATE ?? row.date ?? row.day ?? row.Date ?? row['DATE'] ?? row['date'] ?? row['Date'];
        if (!dateRaw) continue; // Skip if no date

        // Normalize Date (assuming YYYY-MM-DD format in row)
        const dateKey = String(dateRaw).split('T')[0];

        if (!groups[dateKey]) {
            groups[dateKey] = {
                rows: [],
                impressions: 0,
                clicks: 0,
                revenue: 0
            };
        }

        const g = groups[dateKey];

        // Metrics keys: check common variations + ADX specific
        const impr = row.IMPRESSIONS ?? row.impressions ?? row['IMPRESSIONS'] ?? row['impressions'] ?? row.mk_impressions ?? row.AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS ?? 0;
        const clicks = row.CLICKS ?? row.clicks ?? row['CLICKS'] ?? row['clicks'] ?? row.mk_clicks ?? row.AD_EXCHANGE_LINE_ITEM_LEVEL_CLICKS ?? 0;
        const rev = row.REVENUE ?? row.revenue ?? row['REVENUE'] ?? row['revenue'] ?? row.mk_revenue ?? row.AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE ?? 0;

        // DEBUG LOG for first few iterations
        if (Math.random() < 0.01) {
            console.log("DEBUG ROW:", { date: dateKey, impr, clicks, rev, parsedRev: parseNumber(rev) });
        }

        g.rows.push(row);
        g.impressions += parseNumber(impr);
        g.clicks += parseNumber(clicks);
        g.revenue += parseNumber(rev);
    }

    // Convert to doc array
    const docs = [];
    for (const [date, data] of Object.entries(groups)) {
        let ecpm = 0;
        // Chia 10^6 nếu revenue là micros (chưa chắc chắn, check log trước)
        // Hiện tại giữ nguyên logic nhưng log ra kết quả
        if (data.impressions > 0) {
            ecpm = (data.revenue / data.impressions) * 1000;
        }

        console.log(`DEBUG AGG: ${date} | Impr: ${data.impressions} | Rev: ${data.revenue} | eCPM: ${ecpm}`);

        // Appwrite DateTime: YYYY-MM-DDTHH:mm:ss.sss+00:00
        // Ensure date is valid for parsing
        let isoDate;
        try {
            // Simplest approach: append time if missing
            if (date.length === 10) isoDate = `${date}T00:00:00.000+00:00`;
            else isoDate = new Date(date).toISOString();
        } catch (e) {
            isoDate = new Date().toISOString();
        }

        docs.push({
            networkCode: String(networkCode),
            date: isoDate,
            impressions: data.impressions,
            clicks: data.clicks,
            revenue: data.revenue,
            ecpm: ecpm,
            options: JSON.stringify(data.rows),
            status: 'updating'
        });
    }
    return docs;
}

// Upsert theo (networkCode, date, ad_unit_name)
async function upsertAdsReport(databases, doc) {
    try {

        const filters = [
            Query.equal("networkCode", doc.networkCode),
            Query.equal('date', doc.date),
            Query.equal('site', doc.site),
            Query.equal('ad_unit_name', doc.ad_unit_name || ''),
        ];
        const found = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            APPWRITE_ADS_REPORT_COLLECTION_ID,
            filters
        );
        // console.log("update create report: ", doc)
        if (found.total > 0) {
            const existing = found.documents[0];
            return databases.updateDocument(
                APPWRITE_DATABASE_ID,
                APPWRITE_ADS_REPORT_COLLECTION_ID,
                existing.$id,
                {
                    impressions: doc.impressions,
                    options: doc.options,
                }
            );
        } else {
            return databases.createDocument(
                APPWRITE_DATABASE_ID,
                APPWRITE_ADS_REPORT_COLLECTION_ID,
                ID.unique(),
                doc
            );
        }

    } catch (err) {
        return { ok: false, err, doc };
    }
}

async function fetchReportForNetworkCode(networkCode, startStr, endStr) {
    //HISTORICAL
    const url = new URL(BASE_REPORT_URL);
    url.searchParams.set('preset', 'adx');
    url.searchParams.set('dimensions', 'DATE_PT,SITE_NAME,AD_UNIT_ID,AD_UNIT_NAME');
    url.searchParams.set('columns', 'AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS,AD_EXCHANGE_LINE_ITEM_LEVEL_CLICKS,AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE');
    url.searchParams.set('time_zone_type', 'PACIFIC');
    url.searchParams.set('ad_unit_view', 'FLAT');
    url.searchParams.set('start_date', startStr);
    url.searchParams.set('end_date', endStr);
    url.searchParams.set('network_code', String(networkCode));

    const res = await axios.get(url.toString(), {
        headers: { Accept: 'application/json' },
        timeout: 300000, // 30 giây
    });


    if (res.data?.row_count <= 0) {
        return [];
        // throw new Error(`Report API ${networkCode} failed: HTTP ${res.status}`);
    }

    const data = await res.data;
    console.log("res: ", res.data?.row_count)
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
}

async function runOnce(days) {


    // Lấy networkCodes có status = true
    const codesRes = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_NETWORK_CODES_COLLECTION_ID,
        [Query.equal('status', true),
        Query.orderAsc('getDataTime')
        ]
    );

    if (!codesRes.total) {
        console.log('No active networkCodes');
        return;
    }

    const { startStr, endStr } = getLast3DaysRange(days);
    // let startStr = '2025-11-17'
    // let endStr = '2025-11-18'
    console.log(
        `[CRON] Tất cả ${codesRes.total} network code(s) | range: ${startStr}..${endStr}`
    );


    for (const [index, doc] of codesRes.documents.entries()) {
        const networkCode = doc.networkCode ?? doc['networkCode'];
        if (!networkCode) continue;

        try {
            // if (networkCode != '22545677070') continue;
            const rows = await fetchReportForNetworkCode(
                networkCode,
                startStr,
                endStr
            );
            console.log(" get data network code: ", networkCode + " - ", startStr + " - " + endStr + " - " + doc.title + " - last get: ", doc.getDataTime + " - " + index)
            if (!rows.length) {
                console.log(`No rows for networkCode=${networkCode}`);
                continue;
            }

            // 0. Xoá rác (nếu có) status = 'updating' trước khi tạo mới
            let startStr1 = startStr + 'T00:00:00.000+00:00';
            let endStr1 = endStr + 'T23:59:59.999+00:00';

            const junkRes = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_ADS_REPORT_COLLECTION_ID, [
                Query.equal("networkCode", networkCode),
                Query.greaterThanEqual("date", startStr1),
                Query.lessThanEqual("date", endStr1),
                Query.equal("status", "updating"),
                Query.limit(200000)
            ]);
            if (junkRes.total > 0) {
                console.log("Dọn dẹp data rác 'updating': ", junkRes.total);
                await deleteConcurrent(junkRes.documents, 100);
            }

            // 1. Prepare aggregated data
            console.log("Aggregating data...");
            const aggregatedDocs = aggregateRows(rows, networkCode);
            console.log(`Gộp ${rows.length} rows -> ${aggregatedDocs.length} aggregated docs`);

            // 1. Ghi dữ liệu mới với status = 'updating'
            console.log("Bắt đầu ghi dữ liệu mới (status=updating)...");
            await createDocsConcurrent(aggregatedDocs, 100);

            // 2. Xoá dữ liệu cũ (status != 'updating')
            // Lưu ý: data cũ ở đây là data đang active (hoặc status khác updating)
            const oldRes = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_ADS_REPORT_COLLECTION_ID, [
                Query.equal("networkCode", networkCode),
                Query.greaterThanEqual("date", startStr1),
                Query.lessThanEqual("date", endStr1),
                Query.notEqual("status", "updating"),
                Query.limit(200000)
            ]);
            console.log("Data cũ cần xoá: ", oldRes.documents.length)

            // [OPT] Bỏ qua bước update status='deleting' để tăng tốc
            await deleteConcurrent(oldRes.documents, 100);
            console.log("Đã xoá hết data cũ.");

            // 3. Cập nhật status='active' cho dữ liệu mới
            const newRes = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_ADS_REPORT_COLLECTION_ID, [
                Query.equal("networkCode", networkCode),
                Query.greaterThanEqual("date", startStr1),
                Query.lessThanEqual("date", endStr1),
                Query.equal("status", "updating"),
                Query.limit(200000)
            ]);
            console.log("Kích hoạt data mới (active): ", newRes.documents.length);
            await updateStatusConcurrent(newRes.documents, 'active', 100);

            const useBangkok = ""
            const iso = useBangkok ? nowBangkokIso() : nowUtcIso();
            await databases.updateDocument(
                APPWRITE_DATABASE_ID,
                APPWRITE_NETWORK_CODES_COLLECTION_ID,
                doc.$id,
                { getDataTime: iso }
            );
            console.log(`Done networkCode=${networkCode} (${rows.length} row(s))`);
        } catch (e) {
            console.error(`Fetch failed for networkCode=${networkCode}`, e);
        }
    }

    console.log('[CRON] Completed.');
}


// 🧹 Hàm xoá toàn bộ dữ liệu
async function deleteAllAdsReports() {
    try {
        let totalDeleted = 0;
        while (true) {
            // Lấy tối đa 100 documents mỗi lượt (Appwrite giới hạn 100)
            const docs = await databases.listDocuments(APPWRITE_DATABASE_ID, 'adsReport', [
                Query.limit(100),
            ]);

            if (docs.total === 0) break;

            for (const doc of docs.documents) {
                await databases.deleteDocument(APPWRITE_DATABASE_ID, 'adsReport', doc.$id);
                totalDeleted++;
                console.log(`🗑️ Đã xoá document: ${doc.$id}`);
            }

            // Nếu ít hơn 100 thì hết dữ liệu
            if (docs.documents.length < 100) break;
        }

        console.log(`✅ Hoàn tất — đã xoá ${totalDeleted} document(s)`);
    } catch (error) {
        console.error('❌ Lỗi khi xoá dữ liệu:', error);
    }
}

// Gọi hàm
// deleteAllAdsReports();


// Chạy ngay 1 lần khi khởi động
// runOnce(0).catch((err) => console.error(err));

// Lịch cron: mỗi giờ vào phút 0
// let isRunning = false;
let isRunning = true;

cron.schedule('*/15 * * * *', async () => {
    if (isRunning) {
        console.log('⏳ Cron đang chạy, bỏ qua lần này.');
        return;
    }

    isRunning = true;
    console.log('🚀 Bắt đầu cron lúc', new Date().toISOString());

    try {
        await runOnce(0);
    } catch (err) {
        console.error('❌ Lỗi khi chạy runOnce:', err);
    } finally {
        isRunning = false;
        console.log('✅ Cron hoàn tất lúc', new Date().toISOString());
    }
});

cron.schedule('* */3 * * *', async () => {
    if (isRunning) {
        console.log('⏳ Cron đang chạy, bỏ qua lần này.');
        return;
    }

    isRunning = true;
    console.log('🚀 Bắt đầu cron lúc', new Date().toISOString());

    try {
        await runOnce(7);
    } catch (err) {
        console.error('❌ Lỗi khi chạy runOnce:', err);
    } finally {
        isRunning = false;
        console.log('✅ Cron hoàn tất lúc', new Date().toISOString());
    }
});