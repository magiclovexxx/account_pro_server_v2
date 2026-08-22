import { Client } from 'ssh2';

const conn = new Client();

const testFullSystem = `
cd /home/account_pro_server_v2
pm2 delete account_pro_server || true
pm2 start server.js --name account_pro_server
pm2 save
sleep 3

echo "=========================================="
echo "📊 PM2 STATUS & HEALTH CHECK"
echo "=========================================="
pm2 status account_pro_server

echo "=========================================="
echo "🔑 1. TEST POST /api/auth/login"
echo "=========================================="
LOGIN_RESP=\$(curl -s -X POST http://127.0.0.1:6789/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"magic.loveptit@gmail.com","password":"12345678"}')

echo "\$LOGIN_RESP"

TOKEN=\$(echo "\$LOGIN_RESP" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "\$TOKEN" ]; then
  echo "✅ JWT Token obtained: \${TOKEN:0:30}..."

  echo "=========================================="
  echo "👤 2. TEST GET /api/auth/me (User Profile via Bearer Token)"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" http://127.0.0.1:6789/api/auth/me
  echo ""

  echo "=========================================="
  echo "🛠️ 3. TEST GET /api/orders/my-tools"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" http://127.0.0.1:6789/api/orders/my-tools
  echo ""

  echo "=========================================="
  echo "📊 4. TEST GET /api/gam/network-codes"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" http://127.0.0.1:6789/api/gam/network-codes | head -c 200
  echo "..."

  echo "=========================================="
  echo "📈 5. TEST GET /api/gam/reports (PostgreSQL live query)"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" "http://127.0.0.1:6789/api/gam/reports?limit=2"
  echo ""

  echo "=========================================="
  echo "🌐 6. TEST HTTPS DOMAIN ACCOUNT.PRO.VN"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" https://account.pro.vn/api/auth/me
  echo ""

  echo "=========================================="
  echo "🌐 7. TEST ADS.KINGOFTOOL.NET NGINX"
  echo "=========================================="
  curl -s -H "Host: ads.kingoftool.net" -H "Authorization: Bearer \$TOKEN" http://127.0.0.1/api/auth/me
  echo ""
else
  echo "❌ Login failed!"
fi
`;

conn.on('ready', () => {
    console.log('SSH Client :: testing full system');
    conn.exec(testFullSystem, (err, stream) => {
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
