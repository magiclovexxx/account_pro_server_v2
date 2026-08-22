import { Client } from 'ssh2';

const conn = new Client();

const runScript = `
cat << 'EOF' > /home/account_pro_server_v2/test_single_fix.js
import axios from 'axios';
import fs from 'fs';
import { google } from 'googleapis';

function parseDateToObj(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return { year, month, day };
}

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
    const startStr = '2025-10-20';
    const endStr = '2025-10-22';

    const dimensions = ['DATE', 'SITE', 'AD_UNIT_NAME'];
    const metrics = [
        'AD_EXCHANGE_IMPRESSIONS',
        'AD_EXCHANGE_CLICKS',
        'AD_EXCHANGE_REVENUE',
        'AD_EXCHANGE_AVERAGE_ECPM',
        'AD_REQUESTS',
        'AD_EXCHANGE_MATCH_RATE',
        'AD_EXCHANGE_CTR',
    ];

    const reportBody = {
        displayName: \`Cron Report \${networkCode} \${startStr}~\${endStr} \${Date.now()}\`,
        reportDefinition: {
            dimensions,
            metrics,
            dateRange: {
                fixed: {
                    startDate: parseDateToObj(startStr),
                    endDate: parseDateToObj(endStr),
                },
            },
            reportType: 'HISTORICAL',
            currencyCode: 'USD',
        },
    };

    try {
        const createResp = await axios.post(
            \`https://admanager.googleapis.com/v1/networks/\${networkCode}/reports\`,
            reportBody,
            { headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' } }
        );
        console.log("✅ Report created successfully:", createResp.data);

        const reportName = createResp.data.name;
        const runResp = await axios.post(
            \`https://admanager.googleapis.com/v1/\${reportName}:run\`,
            {},
            { headers: { Authorization: \`Bearer \${token}\` } }
        );
        console.log("✅ Operation created:", runResp.data.name);

    } catch (err) {
        console.error("❌ Google GAM Error detail:", JSON.stringify(err.response?.data, null, 2) || err.message);
    }
    process.exit(0);
}

testDetail();
EOF

cd /home/account_pro_server_v2
node test_single_fix.js
rm test_single_fix.js
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
