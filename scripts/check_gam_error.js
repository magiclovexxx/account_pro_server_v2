import { Client } from 'ssh2';

const conn = new Client();

const runScript = `
cat << 'EOF' > /home/account_pro_server_v2/test_single_err.js
import axios from 'axios';
import fs from 'fs';
import { google } from 'googleapis';

async function testDetail() {
    const keyFile = JSON.parse(fs.readFileSync('account.json', 'utf-8'));
    const auth = new google.auth.GoogleAuth({
        credentials: keyFile,
        scopes: ['https://www.googleapis.com/auth/admanager'],
    });
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    const token = tokenResp.token;

    const networkCode = '22849387084';
    // Thử test với năm thực tế 2025 hoặc dateRange
    const reportBody = {
        report: {
            reportDefinition: {
                dimensions: ['DATE', 'SITE', 'AD_UNIT_NAME'],
                metrics: [
                    'AD_EXCHANGE_IMPRESSIONS',
                    'AD_EXCHANGE_CLICKS',
                    'AD_EXCHANGE_REVENUE',
                    'AD_EXCHANGE_ESTIMATED_ECPM',
                ],
                dateRange: {
                    fixed: {
                        startDate: { year: 2025, month: 10, day: 20 },
                        endDate: { year: 2025, month: 10, day: 22 },
                    },
                },
                timeZoneType: 'TIME_ZONE_TYPE_UNSPECIFIED',
            },
        },
    };

    try {
        const createResp = await axios.post(
            \`https://admanager.googleapis.com/v1/networks/\${networkCode}/reports\`,
            reportBody,
            { headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' } }
        );
        console.log("✅ Report created:", createResp.data);
    } catch (err) {
        console.error("❌ Google GAM Error detail:", JSON.stringify(err.response?.data, null, 2) || err.message);
    }
    process.exit(0);
}

testDetail();
EOF

cd /home/account_pro_server_v2
node test_single_err.js
rm test_single_err.js
`;

conn.on('ready', () => {
    conn.exec(runScript, (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('close', (code, signal) => {
            console.log(output);
            conn.end();
            process.exit(code || 0);
        }).on('data', (data) => {
            process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });
    });
}).connect({
    host: '42.96.15.241',
    port: 26266,
    username: 'root',
    password: 'Xij:^_^8!',
    readyTimeout: 60000
});
