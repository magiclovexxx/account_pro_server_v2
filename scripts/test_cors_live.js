import axios from 'axios';

async function testCors() {
    console.log("=== Testing POST /api/auth/login with Origin: https://ads.kingoftool.net ===");
    try {
        const resp1 = await axios.post('https://account.pro.vn/api/auth/login', {
            email: 'magic.loveptit@gmail.com',
            password: 'wrongpassword'
        }, {
            headers: {
                'Origin': 'https://ads.kingoftool.net',
                'Content-Type': 'application/json'
            },
            validateStatus: () => true
        });

        console.log("Status:", resp1.status);
        console.log("Access-Control-Allow-Origin header:", resp1.headers['access-control-allow-origin']);
        console.log("Access-Control-Allow-Credentials header:", resp1.headers['access-control-allow-credentials']);
        console.log("Response Body:", resp1.data);
    } catch (e) {
        console.error("Error resp1:", e.message);
    }

    console.log("\n=== Testing POST on https://ads.kingoftool.net/api/auth/login with Origin: https://ads.kingoftool.net ===");
    try {
        const resp2 = await axios.post('https://ads.kingoftool.net/api/auth/login', {
            email: 'magic.loveptit@gmail.com',
            password: 'wrongpassword'
        }, {
            headers: {
                'Origin': 'https://ads.kingoftool.net',
                'Content-Type': 'application/json'
            },
            validateStatus: () => true
        });

        console.log("Status:", resp2.status);
        console.log("Access-Control-Allow-Origin header:", resp2.headers['access-control-allow-origin']);
        console.log("Access-Control-Allow-Credentials header:", resp2.headers['access-control-allow-credentials']);
        console.log("Response Body:", resp2.data);
    } catch (e) {
        console.error("Error resp2:", e.message);
    }

    console.log("\n=== Testing SUCCESSFUL LOGIN on https://account.pro.vn/api/auth/login from https://ads.kingoftool.net ===");
    try {
        const resp3 = await axios.post('https://account.pro.vn/api/auth/login', {
            email: 'magic.loveptit@gmail.com',
            password: '12345678'
        }, {
            headers: {
                'Origin': 'https://ads.kingoftool.net',
                'Content-Type': 'application/json'
            },
            validateStatus: () => true
        });

        console.log("Status:", resp3.status);
        console.log("Access-Control-Allow-Origin header:", resp3.headers['access-control-allow-origin']);
        console.log("Token received:", resp3.data.token ? 'YES' : 'NO');
        console.log("User email:", resp3.data.user?.email);
    } catch (e) {
        console.error("Error resp3:", e.message);
    }
}

testCors();
