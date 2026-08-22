import prisma from '../src/prisma.js';

async function checkUnaggregated() {
    const withSiteCount = await prisma.adsReport.count({
        where: { site: { not: null } }
    });
    console.log("Count of unaggregated rows (site is not null):", withSiteCount);

    const oldAggCount = await prisma.adsReport.count({
        where: { site: null }
    });
    console.log("Count of old aggregated rows (site is null):", oldAggCount);

    process.exit(0);
}

checkUnaggregated();
