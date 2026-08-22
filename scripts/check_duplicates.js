import prisma from '../src/prisma.js';

async function checkDuplicates() {
    console.log("=== CHECKING FOR DUPLICATE ADS_REPORTS ===");
    const duplicates = await prisma.$queryRaw`
        SELECT "networkCode", "date", COUNT(*) as cnt
        FROM "ads_reports"
        GROUP BY "networkCode", "date"
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
        LIMIT 20;
    `;

    console.log("Duplicates found:", duplicates);
    process.exit(0);
}

checkDuplicates();
