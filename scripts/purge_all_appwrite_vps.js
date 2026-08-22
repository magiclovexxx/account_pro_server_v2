import { Client } from 'ssh2';

const conn = new Client();

const deployAndPurgeScript = `
set -e

echo "=== 1. DEPLOY CLEAN FRONTEND ==="
cd /home/account_pro_v2
git pull origin main
npm install
npm run build

echo "=== 2. DEPLOY CLEAN BACKEND ==="
cd /home/account_pro_server_v2
git pull origin main
npm install
pm2 restart account_pro_server

echo "=== 3. PURGE APPWRITE FILES & FOLDERS ON VPS ==="
rm -rf /root/appwrite /root/.appwrite /root/appwrite.config.json /root/functions/appwriteCreateFunction
echo "✅ Removed /root/appwrite directories"

echo "=== 4. REMOVE APPWRITE NGINX REVERSE PROXY CONFIG ==="
rm -f /etc/nginx/conf.d/host-appwrite.kingoftool.net.conf
nginx -t
nginx -s reload
echo "✅ Nginx reloaded without host-appwrite"

echo "=== 5. CHECK REMAINING NGINX SITES ==="
ls -la /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null || true

echo "=== 6. VPS RESOURCE SUMMARY ==="
df -h /
free -m
pm2 list
`;

conn.on('ready', () => {
    conn.exec(deployAndPurgeScript, (err, stream) => {
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
