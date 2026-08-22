import { Client } from 'ssh2';

const conn = new Client();

const runScript = `
cat << 'EOF' > /home/account_pro_server_v2/test_crawl_single.js
import { runOnce } from './getDataGAM.js';
import prisma from './src/prisma.js';

async function main() {
    console.log("🚀 Testing GAM crawl for active network codes...");
    const beforeCount = await prisma.adsReport.count();
    console.log("📊 AdsReports count before:", beforeCount);

    // Call runOnce for 1 day
    await runOnce(1);

    const afterCount = await prisma.adsReport.count();
    console.log("📊 AdsReports count after:", afterCount);
    console.log("✅ GAM Crawl logic verified!");
    process.exit(0);
}

main().catch(err => {
    console.error("❌ Crawl test failed:", err);
    process.exit(1);
});
EOF

cd /home/account_pro_server_v2
node test_crawl_single.js
rm test_crawl_single.js
`;

conn.on('ready', () => {
    console.log('SSH Client :: running GAM single crawl test');
    conn.exec(runScript, (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('close', (code, signal) => {
            console.log(`Command closed with code: ${code}`);
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
