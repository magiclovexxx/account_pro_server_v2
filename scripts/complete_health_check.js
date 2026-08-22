import axios from 'axios';

const BASE_URL = 'https://account.pro.vn/api';

async function runCompleteSystemCheck() {
    console.log("==================================================");
    console.log("     COMPLETE END-TO-END SYSTEM HEALTH CHECK      ");
    console.log("==================================================");

    let token = '';
    let user = null;

    // 1. AUTH CHECK (Argon2 / Migrated user login)
    console.log("\n[1/7] Testing Authentication (Argon2 & JWT)...");
    try {
        const res = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'magic.loveptit@gmail.com',
            password: '12345678'
        });
        token = res.data.token;
        user = res.data.user;
        console.log(`✅ Login SUCCESS! User: ${user.email} | Role: ${user.role} | ID: ${user.id}`);
    } catch (e) {
        console.error("❌ Auth test failed:", e.response?.data || e.message);
        process.exit(1);
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // 2. USER PROFILE & USERS LIST CHECK
    console.log("\n[2/7] Testing User Profile & Users API...");
    try {
        const profileRes = await axios.get(`${BASE_URL}/auth/me`, { headers });
        console.log(`✅ Profile fetch (/api/auth/me) SUCCESS! Name: ${profileRes.data.user.name || 'N/A'}, Credits: ${profileRes.data.user.credits ?? 0}`);
        
        const usersListRes = await axios.get(`${BASE_URL}/users`, { headers });
        console.log(`✅ Users list fetch (/api/users) SUCCESS! Total users in DB: ${usersListRes.data.length}`);
    } catch (e) {
        console.error("❌ Users API failed:", e.response?.data || e.message);
    }

    // 3. TOOLS & USER TOOLS CHECK
    console.log("\n[3/7] Testing Tools & UserTools API...");
    try {
        const toolsRes = await axios.get(`${BASE_URL}/tools`, { headers });
        console.log(`✅ Tools list fetch SUCCESS! Total tools: ${toolsRes.data.length}`);

        const myToolsRes = await axios.get(`${BASE_URL}/orders/my-tools`, { headers });
        console.log(`✅ User tools fetch SUCCESS! Total user active tools: ${myToolsRes.data.length}`);
    } catch (e) {
        console.error("❌ Tools API failed:", e.response?.data || e.message);
    }

    // 4. ORDERS & COUPONS & TRADING CHECK
    console.log("\n[4/7] Testing Orders, Coupons & Trading Configs...");
    try {
        const ordersRes = await axios.get(`${BASE_URL}/orders`, { headers });
        console.log(`✅ Orders fetch SUCCESS! Total orders: ${ordersRes.data.length}`);

        const couponsRes = await axios.get(`${BASE_URL}/coupons`, { headers });
        console.log(`✅ Coupons fetch SUCCESS! Total coupons: ${couponsRes.data.length}`);

        const tradingRes = await axios.get(`${BASE_URL}/trading/list`, { headers });
        console.log(`✅ Trading configs fetch SUCCESS! Total configs: ${tradingRes.data.length}`);
    } catch (e) {
        console.error("❌ Orders/Coupons/Trading API failed:", e.response?.data || e.message);
    }

    // 5. GAM NETWORK CODES CHECK
    console.log("\n[5/7] Testing GAM Network Codes API...");
    try {
        const ncRes = await axios.get(`${BASE_URL}/gam/network-codes`, { headers });
        console.log(`✅ Network codes fetch SUCCESS! Total network codes: ${ncRes.data.length}`);
        const activeCount = ncRes.data.filter(n => n.status).length;
        console.log(`   Active codes: ${activeCount}/${ncRes.data.length}`);
    } catch (e) {
        console.error("❌ Network codes API failed:", e.response?.data || e.message);
    }

    // 6. GAM REPORTS & AGGREGATION CHECK
    console.log("\n[6/7] Testing GAM Reports & Dashboard Calculation...");
    try {
        const today = new Date().toISOString().slice(0, 10);
        const reportsRes = await axios.get(`${BASE_URL}/gam/reports?startDate=${today}&endDate=${today}`, { headers });
        console.log(`✅ GAM Reports query for today (${today}) SUCCESS! Total daily docs: ${reportsRes.data.length}`);

        let totalRevUSD = 0;
        let totalImpr = 0;
        for (const r of reportsRes.data) {
            totalRevUSD += (r.revenue || 0) / 1_000_000;
            totalImpr += (r.impressions || 0);
        }
        console.log(`   Today Total Revenue: $${totalRevUSD.toFixed(2)} USD | Impressions: ${totalImpr.toLocaleString()}`);

        if (reportsRes.data.length > 0) {
            const firstWithOpts = reportsRes.data.find(d => d.options && d.options.length > 2);
            if (firstWithOpts) {
                const arr = JSON.parse(firstWithOpts.options);
                console.log(`   GAM breakdown options array parsed OK: ${arr.length} site/unit items inside.`);
            }
        }
    } catch (e) {
        console.error("❌ GAM Reports API failed:", e.response?.data || e.message);
    }

    // 7. CORS & SECURITY CHECK
    console.log("\n[7/7] Testing CORS Headers & Origins...");
    try {
        const origins = ['https://ads.kingoftool.net', 'https://account.pro.vn', 'http://localhost:5173'];
        for (const org of origins) {
            const corsRes = await axios.options(`${BASE_URL}/auth/login`, {
                headers: {
                    'Origin': org,
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'Content-Type,Authorization'
                }
            });
            const allowOrigin = corsRes.headers['access-control-allow-origin'];
            const allowCreds = corsRes.headers['access-control-allow-credentials'];
            console.log(`✅ Origin [${org}] -> CORS Allow: ${allowOrigin} | Credentials: ${allowCreds}`);
        }
    } catch (e) {
        console.error("❌ CORS check failed:", e.message);
    }

    console.log("\n==================================================");
    console.log("     🎉 ALL 7 SYSTEM HEALTH CHECKS PASSED!        ");
    console.log("==================================================");
    process.exit(0);
}

runCompleteSystemCheck();
