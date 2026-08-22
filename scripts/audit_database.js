import prisma from '../src/prisma.js';
import bcrypt from 'bcryptjs';

async function auditDatabase() {
    console.log('====================================================');
    console.log('🔍 BẮT ĐẦU AUDIT CHI TIẾT TOÀN BỘ HỆ THỐNG DATABASE');
    console.log('====================================================\n');

    // 1. Audit Users & Passwords
    console.log('--- 1. AUDIT USERS & PASSWORDS ---');
    const users = await prisma.user.findMany();
    console.log(`Tổng số users: ${users.length}`);
    
    let defaultPassCount = 0;
    let nullPassCount = 0;
    for (const u of users) {
        if (!u.password) {
            nullPassCount++;
            console.log(`⚠️ User [${u.email}] không có mật khẩu (null)`);
        } else {
            const isDefault = await bcrypt.compare('12345678', u.password);
            if (isDefault) {
                defaultPassCount++;
            }
        }
        // Kiểm tra các trường quan trọng
        const missingFields = [];
        if (!u.id) missingFields.push('id');
        if (!u.email) missingFields.push('email');
        if (!u.role) missingFields.push('role');
        if (missingFields.length > 0) {
            console.log(`⚠️ User [${u.email}] thiếu trường: ${missingFields.join(', ')}`);
        }
    }
    console.log(`✅ ${defaultPassCount}/${users.length} users đang sử dụng mật khẩu mặc định "12345678" (Bcrypt hash hợp lệ).`);
    if (nullPassCount === 0) console.log('✅ 100% users đều có mật khẩu được mã hóa hợp lệ, không có user nào bị null.');

    // 2. Audit Tools
    console.log('\n--- 2. AUDIT TOOLS (listTool) ---');
    const tools = await prisma.tool.findMany();
    console.log(`Tổng số tools: ${tools.length}`);
    for (const t of tools) {
        console.log(`- Tool [${t.name}]: id=${t.id}, price=${t.price}, status=${t.status}, url=${t.url ? 'Có URL' : 'Không có URL'}, cookie=${t.cookie ? 'Có Cookie (' + t.cookie.length + ' chars)' : 'Không có Cookie'}`);
        if (t.package) {
            try {
                const parsed = JSON.parse(t.package);
                console.log(`  -> Gói (package): ${Array.isArray(parsed) ? parsed.length + ' gói' : typeof parsed}`);
            } catch (e) {
                console.log(`  ⚠️ Gói (package) không phải JSON chuẩn: ${t.package}`);
            }
        }
    }

    // 3. Audit Orders & User Relations
    console.log('\n--- 3. AUDIT ORDERS & RELATIONS ---');
    const orders = await prisma.order.findMany();
    console.log(`Tổng số orders: ${orders.length}`);
    const userIds = new Set(users.map(u => u.id));
    const toolIds = new Set(tools.map(t => t.id));
    for (const o of orders) {
        const userExists = userIds.has(o.userId);
        const toolExists = toolIds.has(o.toolId);
        console.log(`- Order [${o.id}]: user=${o.userId} (${userExists ? '✅ Tồn tại' : '❌ Không tìm thấy user'}), tool=${o.toolId} (${toolExists ? '✅ Tồn tại' : '⚠️ Tool không trong listTool'}), exp=${o.expriration_date?.toISOString()}, status=${o.status}`);
    }

    // 4. Audit Coupons
    console.log('\n--- 4. AUDIT COUPONS ---');
    const coupons = await prisma.coupon.findMany();
    console.log(`Tổng số coupons: ${coupons.length}`);
    for (const c of coupons) {
        console.log(`- Coupon [${c.code}]: percent=${c.percent}%, status=${c.status}`);
    }

    // 5. Audit Payments
    console.log('\n--- 5. AUDIT PAYMENTS ---');
    const payments = await prisma.payment.findMany();
    console.log(`Tổng số payments: ${payments.length}`);
    for (const p of payments) {
        console.log(`- Payment [${p.id}]: code=${p.contentPayment}, amount=${p.amount}, status=${p.isPurchased}, user=${p.userId}`);
    }

    // 6. Audit NetworkCodes
    console.log('\n--- 6. AUDIT NETWORK CODES ---');
    const networkCodes = await prisma.networkCode.findMany();
    console.log(`Tổng số networkCodes: ${networkCodes.length}`);
    for (const nc of networkCodes) {
        const userExists = userIds.has(nc.userId);
        console.log(`- NetworkCode [${nc.networkCode}]: title="${nc.title}", profit=${nc.profit}%, user=${nc.userId} (${userExists ? '✅' : '❌'}), status=${nc.status}`);
    }

    // 7. Audit AdsReports
    console.log('\n--- 7. AUDIT ADS REPORTS ---');
    const reportCount = await prisma.adsReport.count();
    console.log(`Tổng số AdsReports: ${reportCount}`);
    
    const sampleReports = await prisma.adsReport.findMany({ take: 3, orderBy: { date: 'desc' } });
    for (const r of sampleReports) {
        console.log(`- Sample Report [${r.id}]: date=${r.date?.toISOString().slice(0, 10)}, networkCode=${r.networkCode}, site=${r.site}, revenue=$${r.revenue}, impr=${r.impressions}, clicks=${r.clicks}`);
    }

    // 8. Audit TradingConfigs
    console.log('\n--- 8. AUDIT TRADING CONFIGS ---');
    const tradingConfigs = await prisma.tradingConfig.findMany();
    console.log(`Tổng số TradingConfigs: ${tradingConfigs.length}`);
    for (const tc of tradingConfigs) {
        console.log(`- Config [${tc.id}]: bot=${tc.bot}, symbol=${tc.symbol}, user=${tc.userId}`);
    }

    console.log('\n====================================================');
    console.log('✅ AUDIT HOÀN TẤT!');
    console.log('====================================================');
    process.exit(0);
}

auditDatabase().catch(err => {
    console.error('❌ Audit Error:', err);
    process.exit(1);
});
