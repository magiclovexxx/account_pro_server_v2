// cron-ads-report.mjs
// Chạy mỗi giờ. Node 18+ (có global fetch).

import { Client, Databases, Query, ID } from 'node-appwrite';
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();
// (Tuỳ chọn) Tải biến môi trường từ .env
// import 'dotenv/config';


const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY
const APPWRITE_ADS_REPORT_COLLECTION_ID = 'adsReport'
const APPWRITE_NETWORK_CODES_COLLECTION_ID = 'networkCodes'
const BASE_REPORT_URL = 'https://account.pro.vn/python-api/gam/report';


console.log("APPWRITE_ENDPOINT: ", APPWRITE_ENDPOINT)

// ====== Helper: format ngày theo Asia/Bangkok ======
function toBangkokDateString(d) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return fmt.format(d); // YYYY-MM-DD
}

// Trả về 3 ngày gần nhất (theo Bangkok): [today-2 .. today]
function getLast3DaysRange() {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 2);

    const startStr = toBangkokDateString(start);
    const endStr = toBangkokDateString(end);
    return { startStr, endStr };
}

// Chuẩn hoá dữ liệu hàng từ API thành record cho adsReport
function mapRowToReportDocs(networkCode, row) {
    // console.log("Map row ", networkCode, row)
    const dateRaw =
        row.DATE ?? row.date ?? row.day ?? row.Date ?? row['DATE'] ?? row['date']?? row['Date'];
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
    const onlyDate = (dateRaw ?? '').toString().slice(0, 10);
    const isoDate = `${onlyDate}T00:00:00+07:00`;

    const impressions = impressionsRaw != null ? Number(impressionsRaw) : 0;

    return {
        networkCode: String(networkCode),
        date: isoDate,
        site: site,
        ad_unit_name: adUnitName ? String(adUnitName) : '',
        options: JSON.stringify(row),
    };
}

// Upsert theo (networkCode, date, ad_unit_name)
async function upsertAdsReport(databases, doc) {
    const filters = [
        Query.equal("networkCode", doc.networkCode),
        Query.equal('date', doc.date),
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
}

async function fetchReportForNetworkCode(networkCode, startStr, endStr) {
    console.log(" get data network code: ", networkCode)
    const url = new URL(BASE_REPORT_URL);
    url.searchParams.set('preset', 'adx');
    url.searchParams.set('dimensions', 'DATE,SITE_NAME,AD_UNIT_ID,AD_UNIT_NAME');
    url.searchParams.set('ad_unit_view', 'FLAT');
    url.searchParams.set('start_date', startStr);
    url.searchParams.set('end_date', endStr);
    url.searchParams.set('network_code', String(networkCode));

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
        throw new Error(`Report API ${networkCode} failed: HTTP ${res.status}`);
    }

    const data = await res.json();

    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
}

async function runOnce() {

    const client = new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID)
        .setKey(APPWRITE_API_KEY);

    const databases = new Databases(client);

    // Lấy networkCodes có status = true
    const codesRes = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_NETWORK_CODES_COLLECTION_ID,
        [Query.equal('status', true)]
    );

    if (!codesRes.total) {
        console.log('No active networkCodes');
        return;
    }

    const { startStr, endStr } = getLast3DaysRange();
    console.log(
        `[CRON] Tất cả ${codesRes.total} network code(s) | range: ${startStr}..${endStr}`
    );


    for (const doc of codesRes.documents) {
        const networkCode = doc.networkCode ?? doc['networkCode'];
        if (!networkCode) continue;

        try {
            const rows = await fetchReportForNetworkCode(
                networkCode,
                startStr,
                endStr
            );

            if (!rows.length) {
                console.log(`No rows for networkCode=${networkCode}`);
                continue;
            }

            for (const row of rows) {
                const reportDoc = mapRowToReportDocs(networkCode, row);
                //  console.log("reportDoc ", networkCode, reportDoc)
                if (!reportDoc.date || reportDoc.ad_unit_name === undefined) continue;
                // return
                try {
                    await upsertAdsReport(databases, reportDoc);
                } catch (e) {
                    
                    console.error(`Upsert failed for ${networkCode}`, e.message);
                    console.log("update create report: ", reportDoc)
                }
            }


            console.log(`Done networkCode=${networkCode} (${rows.length} row(s))`);
        } catch (e) {
            console.error(`Fetch failed for networkCode=${networkCode}`, e.message);
        }
    }

    console.log('[CRON] Completed.');
}

// Chạy ngay 1 lần khi khởi động
runOnce().catch((err) => console.error(err));

// Lịch cron: mỗi giờ vào phút 0
cron.schedule('*/5 * * * *', () => {
    runOnce().catch((err) => console.error(err));
});
