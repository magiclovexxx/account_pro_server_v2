import axios from 'axios';

async function runLiveProductionTests() {
    console.log('🚀 Bắt đầu kiểm tra hệ thống LIVE trên Production...');

    // 1. Test Login on https://account.pro.vn/api/auth/login
    console.log('1. Testing Login on https://account.pro.vn/api/auth/login...');
    const loginRes = await axios.post('https://account.pro.vn/api/auth/login', {
        email: 'magic.loveptit@gmail.com',
        password: '12345678'
    });

    const token = loginRes.data.token;
    const user = loginRes.data.user;
    console.log(`✅ Đăng nhập thành công! User: ${user.name} (${user.email}), Role: ${user.role}`);
    console.log(`✅ Token: ${token.slice(0, 30)}...`);

    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    // 2. Test /api/auth/me
    console.log('\n2. Testing /api/auth/me...');
    const meRes = await axios.get('https://account.pro.vn/api/auth/me', authHeaders);
    console.log(`✅ /api/auth/me trả về user id: ${meRes.data.user.$id}`);

    // 3. Test /api/tools
    console.log('\n3. Testing /api/tools...');
    const toolsRes = await axios.get('https://account.pro.vn/api/tools', authHeaders);
    console.log(`✅ /api/tools: ${toolsRes.data.length} tools tìm thấy.`);

    // 4. Test /api/orders/my-tools
    console.log('\n4. Testing /api/orders/my-tools...');
    const myToolsRes = await axios.get('https://account.pro.vn/api/orders/my-tools', authHeaders);
    console.log(`✅ /api/orders/my-tools: ${myToolsRes.data.length} orders tìm thấy.`);

    // 5. Test /api/gam/network-codes
    console.log('\n5. Testing /api/gam/network-codes...');
    const ncRes = await axios.get('https://account.pro.vn/api/gam/network-codes', authHeaders);
    console.log(`✅ /api/gam/network-codes: ${ncRes.data.length} network codes tìm thấy.`);

    // 6. Test /api/gam/reports (live PostgreSQL query)
    console.log('\n6. Testing /api/gam/reports...');
    const reportsRes = await axios.get('https://account.pro.vn/api/gam/reports?limit=5', authHeaders);
    console.log(`✅ /api/gam/reports: ${reportsRes.data.length} reports retrieved từ PostgreSQL.`);

    // 7. Test /api/trading/list
    console.log('\n7. Testing /api/trading/list...');
    const tradingRes = await axios.get('https://account.pro.vn/api/trading/list', authHeaders);
    console.log(`✅ /api/trading/list: ${tradingRes.data.length} configs retrieved.`);

    // 8. Test Frontend SPA HTML on https://account.pro.vn
    console.log('\n8. Testing Frontend HTML on https://account.pro.vn...');
    const htmlRes = await axios.get('https://account.pro.vn');
    console.log(`✅ Frontend Status: ${htmlRes.status}, Size: ${htmlRes.data.length} bytes`);

    // 9. Test Frontend HTML on http://42.96.15.241 with Host: ads.kingoftool.net
    console.log('\n9. Testing Frontend on Host ads.kingoftool.net...');
    const adsRes = await axios.get('http://42.96.15.241', {
        headers: { Host: 'ads.kingoftool.net' }
    });
    console.log(`✅ ads.kingoftool.net Status: ${adsRes.status}, Size: ${adsRes.data.length} bytes`);

    console.log('\n🎉 TẤT CẢ CÁC BÀI KIỂM THỬ LIVE TRÊN PRODUCTION ĐỀU THÀNH CÔNG 100%!');
    process.exit(0);
}

runLiveProductionTests().catch(err => {
    console.error('❌ Test failed:', err.response?.data || err.message);
    process.exit(1);
});
