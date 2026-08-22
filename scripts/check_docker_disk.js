import { Client } from 'ssh2';

const conn = new Client();

const runScript = `
echo "=== DOCKER DISK USAGE ==="
docker system df

echo "=== BACKUPS IN /root OR /home ==="
ls -lh /root/*.sql /root/*.gz /home/*.sql 2>/dev/null || echo "No sql backups found"

echo "=== SIZE OF MAIN DIRS ==="
du -sh /var/lib/docker /home/* 2>/dev/null
`;

conn.on('ready', () => {
    conn.exec(runScript, (err, stream) => {
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
