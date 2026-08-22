import prisma from '../src/prisma.js';

async function inspectAdsData() {
    console.log("=== Inspecting ads_reports table ===");
    const sampleRows = await prisma.adsReport.findMany({
        take: 10,
        orderBy: { date: 'desc' }
    });

    console.log("Sample 10 rows date & networkCode & impressions & revenue:");
    for (const r of sampleRows) {
        console.log({
            id: r.id,
            networkCode: r.networkCode,
            date: r.date.toISOString(),
            impressions: r.impressions,
            clicks: r.clicks,
            revenue: r.revenue,
            ecpm: r.ecpm,
            options: r.options ? (typeof r.options === 'string' ? r.options.slice(0, 100) : JSON.stringify(r.options).slice(0, 100)) : null
        });
    }

    const minMaxDate = await prisma.$queryRaw`
        SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as total_rows FROM ads_reports;
    `;
    console.log("Min, Max Date and Total Rows:", minMaxDate);

    process.exit(0);
}

inspectAdsData();
