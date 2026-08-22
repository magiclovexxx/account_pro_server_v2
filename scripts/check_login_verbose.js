import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
    conn.exec('curl -v -X POST http://127.0.0.1:6789/api/auth/login -H "Content-Type: application/json" -d \'{"email":"magic.loveptit@gmail.com","password":"12345678"}\'; echo "=== PM2 LOGS ==="; pm2 logs account_pro_server --lines 30 --nostream', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('close', (code, signal) => {
            console.log('--- OUTPUT ---');
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
    readyTimeout: 20000
});
