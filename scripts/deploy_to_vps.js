import { Client } from 'ssh2';

const conn = new Client();

const deployCommands = `
set -e
echo "=========================================="
echo "🚀 1. DEPLOYING BACKEND (/home/account_pro_server_v2)..."
echo "=========================================="
cd /home/account_pro_server_v2
git reset --hard HEAD
git pull origin main
npm install --legacy-peer-deps
npx prisma generate

cat << 'EOF' > .env
PORT=6789
DATABASE_URL="postgresql://postgres:AccountPro%402026%21@127.0.0.1:5432/account_pro?schema=public"
JWT_SECRET="account_pro_jwt_secret_key_2026_981273918237"
GEMINI_KEY="AIzaSyArCzeLll_fbr6mOqorZU2FHcgHLHKAH_M"
EOF

pm2 restart account_pro_server || pm2 start server.js --name account_pro_server
pm2 save

echo "=========================================="
echo "🚀 2. DEPLOYING FRONTEND (/home/account_pro_v2)..."
echo "=========================================="
cd /home/account_pro_v2
git reset --hard HEAD
git pull origin main
npm install --legacy-peer-deps
npm run build

echo "=========================================="
echo "🚀 3. CONFIGURING NGINX FOR ADS.KINGOFTOOL.NET..."
echo "=========================================="
cat << 'EOF' > /etc/nginx/conf.d/ads.kingoftool.net.conf
server {
    listen 80;
    server_name ads.kingoftool.net;

    root /home/account_pro_v2/dist;
    index index.html;

    client_max_body_size 2000M;
    proxy_connect_timeout 300s;
    proxy_send_timeout    300s;
    proxy_read_timeout    300s;
    send_timeout          300s;

    # ------------------ SPA Frontend ------------------
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ------------------ API Node.js (PostgreSQL) ------------------
    location /api {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Range, Content-Type, Authorization' always;
        add_header 'Access-Control-Max-Age' 86400 always;

        if ($request_method = OPTIONS) {
            return 204;
        }

        proxy_pass http://127.0.0.1:6789;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # ------------------ API Python (GAM) ------------------
    location /python-api/ {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;

        if ($request_method = OPTIONS) {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;
            return 204;
        }

        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

nginx -t
systemctl reload nginx

echo "=========================================="
echo "🎉 DEPLOYMENT FINISHED SUCCESSFULLY!"
echo "=========================================="
`;

conn.on('ready', () => {
    console.log('SSH Client :: ready for deployment');
    conn.exec(deployCommands, (err, stream) => {
        if (err) throw err;
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
    readyTimeout: 30000
});
