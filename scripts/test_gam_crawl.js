import { Client } from 'ssh2';

const conn = new Client();
const cmd = `cd /home/account_pro_server_v2 && node -e '
import { runOnce } from "./getDataGAM.js";
import prisma from "./src/prisma.js";

async function testCrawl() {
    console.log("🚀 Testing GAM Crawl for 1 active network code...");
    const beforeCount = await prisma.adsReport.count();
    console.log("AdsReports count before crawl:", beforeCount);

    // Run for 1 networkCode (last 2 days)
    const code = await prisma.networkCode.findFirst({ where: { status: true } });
    if (!code) {
        console.log("No active network code found!");
        return;
    }
    console.log("Testing with networkCode:", code.networkCode, code.title);

    // Call runOnce
    await runOnce(2);

    const afterCount = await prisma.adsReport.count();
    console.log("AdsReports count after crawl:", afterCount);
    console.log("✅ GAM Crawl executed successfully without errors!");
}

testCrawl().catch(err => {
    console.error("❌ Crawl test error:", err);
});
'`;

conn.on('ready', () => {
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('close', (code, signal) => {
            console.log(output);
            conn.end();
            process.exit(0);
        }).on('data', (data) => {
            output += data.toString();
        }).stderr.on('data', (data) => {
            output += data.toString();
        });
    });
}).connect({
    host: '42.96.15.241',
    port: 26266,
    username: 'root',
    password: 'Xij:^_^8!',
    readyTimeout: 120000
});
