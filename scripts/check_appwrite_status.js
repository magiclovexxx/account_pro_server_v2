import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
    conn.exec('echo "=== RUNNING CONTAINERS ==="; docker ps; echo "=== APPWRITE CONTAINERS STATUS ==="; docker ps -a --filter name=appwrite --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('close', (code, signal) => {
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
