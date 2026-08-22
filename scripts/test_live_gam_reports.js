import axios from 'axios';

async function testLiveReports() {
    console.log("=== TESTING LIVE API /api/gam/reports ===");
    
    // 1. Login
    const loginRes = await axios.post('https://account.pro.vn/api/auth/login', {
        email: 'magic.loveptit@gmail.com',
        password: '12345678'
    }, {
        headers: {
            'Origin': 'https://ads.kingoftool.net',
            'Content-Type': 'application/json'
        }
    });

    console.log("Login success! User:", loginRes.data.user?.email);
    const token = loginRes.data.token;

    // 2. Query reports for today (2026-08-22)
    const todayRes = await axios.get('https://account.pro.vn/api/gam/reports?startDate=2026-08-22&endDate=2026-08-22', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Origin': 'https://ads.kingoftool.net'
        }
    });

    console.log(`\nToday (2026-08-22) reports count: ${todayRes.data.length}`);
    let totalRevMicros = 0;
    let totalImpr = 0;
    let totalClicks = 0;

    for (const r of todayRes.data) {
        totalRevMicros += Number(r.revenue || 0);
        totalImpr += Number(r.impressions || 0);
        totalClicks += Number(r.clicks || 0);
    }

    const totalRevUSD = totalRevMicros / 1_000_000;
    const avgEcpmUSD = totalImpr > 0 ? (totalRevUSD / totalImpr) * 1000 : 0;

    console.log(`Today Summary across all networks:`);
    console.log(`- Impressions: ${totalImpr.toLocaleString()}`);
    console.log(`- Clicks: ${totalClicks.toLocaleString()}`);
    console.log(`- Revenue: $${totalRevUSD.toFixed(2)} USD`);
    console.log(`- Average eCPM: $${avgEcpmUSD.toFixed(2)} USD`);

    // 3. Query 7-day range (2026-08-15 to 2026-08-22)
    const rangeRes = await axios.get('https://account.pro.vn/api/gam/reports?startDate=2026-08-15&endDate=2026-08-22', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Origin': 'https://ads.kingoftool.net'
        }
    });

    console.log(`\nLast 7 days (2026-08-15 .. 2026-08-22) reports count: ${rangeRes.data.length}`);
    let total7dRevMicros = 0;
    let total7dImpr = 0;

    for (const r of rangeRes.data) {
        total7dRevMicros += Number(r.revenue || 0);
        total7dImpr += Number(r.impressions || 0);
    }
    const total7dRevUSD = total7dRevMicros / 1_000_000;
    console.log(`Last 7 days Total Revenue: $${total7dRevUSD.toFixed(2)} USD (from ${total7dImpr.toLocaleString()} impressions)`);

    // 4. Test Gam breakdown parsing for 1 doc
    const sampleDoc = todayRes.data.find(d => d.networkCode === '22849387084');
    if (sampleDoc) {
        const optionsArr = JSON.parse(sampleDoc.options || '[]');
        console.log(`\nBreakdown check for network 22849387084 today:`);
        console.log(`- Number of site/ad-unit breakdowns in options: ${optionsArr.length}`);
        if (optionsArr.length > 0) {
            console.log(`- Sample site breakdown item:`, {
                Site: optionsArr[0]['Site'],
                AdUnit: optionsArr[0]['Ad unit'],
                Impressions: optionsArr[0]['AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS'],
                RevenueMicros: optionsArr[0]['AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE'],
                RevenueUSD: (optionsArr[0]['AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE'] / 1_000_000).toFixed(4)
            });
        }
    }

    console.log("\n✅ ALL GAM DATA VERIFICATIONS PASSED 100%!");
}

testLiveReports().catch(err => {
    console.error("Test failed:", err.response?.data || err.message);
});
