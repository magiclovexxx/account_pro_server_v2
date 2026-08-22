import { Client } from 'ssh2';

const conn = new Client();

const deployScript = `
echo "=== 1. PULLING AND BUILDING FRONTEND ==="
cd /home/account_pro_v2
git pull origin main
npm run build

echo "=== 2. PULLING BACKEND AND RESTARTING PM2 ==="
cd /home/account_pro_server_v2
git pull origin main
pm2 restart account_pro_server

echo "=== DEPLOY COMPLETE ==="
`;

conn.on('ready', () => {
    conn.exec(deployScript, (err, stream) => {
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
    readyTimeout: 30000
});
