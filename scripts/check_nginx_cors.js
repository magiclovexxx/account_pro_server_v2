import { Client } from 'ssh2';

const conn = new Client();

const checkNginxCors = `
echo "=== NGINX CONFIGS ==="
cat /etc/nginx/conf.d/*.conf || true
echo "=== NGINX SITES AVAILABLE / ENABLED ==="
cat /etc/nginx/sites-enabled/* 2>/dev/null || true
echo "=== MAIN NGINX.CONF ==="
cat /etc/nginx/nginx.conf | grep -i "access-control" || true
`;

conn.on('ready', () => {
    conn.exec(checkNginxCors, (err, stream) => {
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
    readyTimeout: 20000
});
