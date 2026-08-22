import { Client } from 'ssh2';

const conn = new Client();

const runDeployAndRecrawlScript = `
echo "=== 1. PULLING AND BUILDING FRONTEND ==="
cd /home/account_pro_v2
git pull origin main
npm run build

echo "=== 2. PULLING BACKEND AND RESTARTING PM2 ==="
cd /home/account_pro_server_v2
git pull origin main
pm2 restart account_pro_server

echo "=== 3. CLEANING UNAGGREGATED TEST DATA & RUNNING FRESH CRAWL ==="
cat << 'EOF' > /home/account_pro_server_v2/clean_and_recrawl.js
import prisma from './src/prisma.js';
import { runOnce } from './getDataGAM.js';

async function main() {
    console.log("Cleaning unaggregated test rows (site is not null)...");
    const deleted = await prisma.adsReport.deleteMany({
        where: { site: { not: null } }
    });
    console.log(\`Deleted \${deleted.count} unaggregated test rows.\`);

    console.log("Starting full 7-day crawl and proper aggregation...");
    await runOnce(7);

    console.log("Checking updated rows count:");
    const count = await prisma.adsReport.count();
    console.log(\`Total ads_reports in PostgreSQL: \${count}\`);

    const latest = await prisma.adsReport.findMany({
        take: 3,
        orderBy: { date: 'desc' }
    });
    console.log("Sample latest 3 aggregated docs:");
    for (const d of latest) {
        const optionsArr = JSON.parse(d.options || '[]');
        console.log({
            networkCode: d.networkCode,
            date: d.date.toISOString().slice(0, 10),
            impressions: d.impressions,
            clicks: d.clicks,
            revenueMicros: d.revenue,
            revenueUSD: (d.revenue / 1_000_000).toFixed(4),
            ecpmUSD: (d.ecpm / 1_000_000).toFixed(4),
            optionsCount: optionsArr.length
        });
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
EOF

cd /home/account_pro_server_v2
node clean_and_recrawl.js
rm clean_and_recrawl.js
`;

conn.on('ready', () => {
    console.log('SSH Client :: deploying frontend, backend and recrawling aggregated data');
    conn.exec(runDeployAndRecrawlScript, (err, stream) => {
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
    readyTimeout: 120000
});
