import { Client } from 'ssh2';

const conn = new Client();

const checkConfigs = `
echo "=== account.pro.vn.conf ==="
cat /etc/nginx/conf.d/account.pro.vn.conf 2>/dev/null || true
echo "=== ads.kingoftool.net.conf ==="
cat /etc/nginx/conf.d/ads.kingoftool.net.conf 2>/dev/null || true
`;

conn.on('ready', () => {
    conn.exec(checkConfigs, (err, stream) => {
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
