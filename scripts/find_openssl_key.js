import { Client } from 'ssh2';

const conn = new Client();

const findOpensslKey = `
docker inspect appwrite | grep -i "OPENSSL" || true
docker inspect appwrite | grep -i "_APP_KEY" || true
`;

conn.on('ready', () => {
    conn.exec(findOpensslKey, (err, stream) => {
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
