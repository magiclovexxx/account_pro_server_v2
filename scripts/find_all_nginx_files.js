import { Client } from 'ssh2';

const conn = new Client();

const listConfs = `
ls -la /etc/nginx/conf.d/
grep -rn "account.pro.vn" /etc/nginx/
grep -rn "ads.kingoftool.net" /etc/nginx/
`;

conn.on('ready', () => {
    conn.exec(listConfs, (err, stream) => {
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
