import { Client } from 'ssh2';

const conn = new Client();

const testCommands = `
echo "=========================================="
echo "🧪 1. STOPPING REMAINING OPENRUNTIMES..."
echo "=========================================="
docker stop e110c94b3a4f || true

echo "=========================================="
echo "📊 2. PM2 & POSTGRESQL STATUS"
echo "=========================================="
pm2 status account_pro_server
systemctl status postgresql --no-pager | grep "Active:"

echo "=========================================="
echo "🔑 3. TESTING AUTHENTICATION (POST /api/auth/login)"
echo "=========================================="
LOGIN_RESP=\$(curl -s -X POST http://127.0.0.1:6789/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"magic.loveptit@gmail.com","password":"12345678"}')

echo "Login Response: \$LOGIN_RESP"

TOKEN=\$(echo "\$LOGIN_RESP" | grep -o '"token":"[^"]*' | grep -o '[^"]*\$')

if [ -z "\$TOKEN" ]; then
  echo "❌ Token generation failed!"
else
  echo "✅ JWT Token obtained successfully!"

  echo "=========================================="
  echo "👤 4. TESTING GET /api/auth/me WITH BEARER TOKEN"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" http://127.0.0.1:6789/api/auth/me
  echo ""

  echo "=========================================="
  echo "🛠️ 5. TESTING GET /api/orders/my-tools"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" http://127.0.0.1:6789/api/orders/my-tools
  echo ""

  echo "=========================================="
  echo "📊 6. TESTING GET /api/gam/network-codes"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" http://127.0.0.1:6789/api/gam/network-codes
  echo ""

  echo "=========================================="
  echo "📈 7. TESTING GET /api/gam/reports (PostgreSQL live query)"
  echo "=========================================="
  curl -s -H "Authorization: Bearer \$TOKEN" "http://127.0.0.1:6789/api/gam/reports?limit=2"
  echo ""
fi

echo "=========================================="
echo "🌐 8. TESTING NGINX ACCESS VIA DOMAIN ACCOUNT.PRO.VN"
echo "=========================================="
curl -s -I https://account.pro.vn | head -n 5

echo "=========================================="
echo "🌐 9. TESTING NGINX ACCESS VIA DOMAIN ADS.KINGOFTOOL.NET"
echo "=========================================="
curl -s -I -H "Host: ads.kingoftool.net" http://127.0.0.1 | head -n 5

echo "=========================================="
echo "🎉 ALL POST-DEPLOYMENT CHECKS COMPLETE!"
echo "=========================================="
`;

conn.on('ready', () => {
    console.log('SSH Client :: running live post-deployment checks');
    conn.exec(testCommands, (err, stream) => {
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
