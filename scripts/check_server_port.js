import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
    conn.exec('pm2 logs account_pro_server --lines 60 --nostream; cat /home/account_pro_server_v2/server.js | head -n 40', (err, stream) => {
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
