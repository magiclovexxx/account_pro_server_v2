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
// const BASE_REPORT_URL = 'http://192.168.1.100:5000/gam/report';


const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

const databases = new Databases(client);
let x = []
// console.log("APPWRITE_ENDPOINT: ", APPWRITE_ENDPOINT)
// Hàm upsert song song an toàn theo batch
async function upsertInBatches(rows, networkCode, batchSize = 50) {
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


function nowUtcIso() {
    return new Date().toISOString(); // ví dụ: 2025-11-04T03:10:22.123Z
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


async function deleteInBatches(documents, batchSize = 30) {
    for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);

        await Promise.all(
            batch.map(doc =>
                databases.deleteDocument(
                    APPWRITE_DATABASE_ID,
                    APPWRITE_ADS_REPORT_COLLECTION_ID,
                    doc.$id
                )
            )
        );

        console.log(`Đã xoá ${i + batch.length}/${documents.length} docs`);
    }
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
    // const onlyDate = (dateRaw ?? '').toString().slice(0, 10);
    // const isoDate = `${onlyDate}T00:00:00-08:00`;

    const impressions = impressionsRaw != null ? Number(impressionsRaw) : 0;

    return {
        networkCode: String(networkCode),
        date: dateRaw,
        site: site,
        ad_unit_name: adUnitName ? String(adUnitName) : '',
        options: JSON.stringify(row),
    };
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

            // delete all data cũ của khoảng thời gian
            let startStr1 = startStr + 'T00:00:00.000+00:00';
            let endStr1 = endStr + 'T23:59:59.999+00:00';
            const res = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_ADS_REPORT_COLLECTION_ID, [
                Query.equal("networkCode", networkCode),
                Query.greaterThanEqual("date", startStr1),
                Query.lessThanEqual("date", endStr1),
                Query.limit(200000)
            ]);
            console.log("data cũ: ", res.documents.length)
            await deleteInBatches(res.documents, 200);

            console.log("Xoá hết data cũ: ", res.documents.length)
            // fs.writeFileSync('output.txt', JSON.stringify(rows, null, 2), 'utf8');
            // console.log("Đã ghi file output.txt");

            await upsertInBatches(rows, networkCode, 200);

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
runOnce(0).catch((err) => console.error(err));

// Lịch cron: mỗi giờ vào phút 0
let isRunning = false;
// return
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