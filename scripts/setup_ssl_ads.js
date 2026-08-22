import { Client } from 'ssh2';

const conn = new Client();

const checkSSLCommands = `
echo "=========================================="
echo "🌐 1. CHECKING DNS RESOLUTION FOR ADS.KINGOFTOOL.NET"
echo "=========================================="
ping -c 2 ads.kingoftool.net || true
python3 -c "import socket; print('Resolved IP:', socket.gethostbyname('ads.kingoftool.net'))" || echo "DNS could not be resolved from VPS"

echo "=========================================="
echo "🔐 2. ATTEMPTING CERTBOT SSL ISSUANCE FOR ADS.KINGOFTOOL.NET"
echo "=========================================="
certbot --nginx -d ads.kingoftool.net --non-interactive --agree-tos -m magic.loveptit@gmail.com --redirect || certbot certonly --webroot -w /home/account_pro_v2/dist -d ads.kingoftool.net --non-interactive --agree-tos -m magic.loveptit@gmail.com || true

echo "=========================================="
echo "📜 3. CERTBOT STATUS & NGINX CONFIG FOR ADS.KINGOFTOOL.NET"
echo "=========================================="
certbot certificates | grep -A 5 "ads.kingoftool.net" || echo "No cert for ads.kingoftool.net"
cat /etc/nginx/conf.d/ads.kingoftool.net.conf

echo "=========================================="
echo "🔄 4. NGINX TEST & RELOAD"
echo "=========================================="
nginx -t
systemctl reload nginx
`;

conn.on('ready', () => {
    console.log('SSH Client :: checking and configuring SSL');
    conn.exec(checkSSLCommands, (err, stream) => {
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
