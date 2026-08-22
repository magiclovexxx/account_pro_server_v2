import prisma from '../src/prisma.js';

async function checkAdsFormat() {
    console.log("=== CHECKING ADS_REPORTS FORMAT ===");
    
    // 1. Check old migrated records
    const oldDocs = await prisma.adsReport.findMany({
        take: 3,
        orderBy: { date: 'asc' }
    });

    console.log("\n--- OLD MIGRATED ADS_REPORTS ---");
    for (const d of oldDocs) {
        console.log({
            id: d.id,
            networkCode: d.networkCode,
            date: d.date.toISOString(),
            impressions: d.impressions,
            clicks: d.clicks,
            revenue: d.revenue,
            ecpm: d.ecpm,
            site: d.site,
            ad_unit_name: d.ad_unit_name,
            options_type: typeof d.options,
            options_preview: d.options ? d.options.slice(0, 300) : null
        });
    }

    // 2. Check recent records (e.g. today)
    const newDocs = await prisma.adsReport.findMany({
        take: 3,
        orderBy: { date: 'desc' }
    });

    console.log("\n--- RECENT ADS_REPORTS ---");
    for (const d of newDocs) {
        console.log({
            id: d.id,
            networkCode: d.networkCode,
            date: d.date.toISOString(),
            impressions: d.impressions,
            clicks: d.clicks,
            revenue: d.revenue,
            ecpm: d.ecpm,
            site: d.site,
            ad_unit_name: d.ad_unit_name,
            options_type: typeof d.options,
            options_preview: d.options ? d.options.slice(0, 300) : null
        });
    }

    process.exit(0);
}

checkAdsFormat();
