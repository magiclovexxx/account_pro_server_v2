import { Client } from 'ssh2';

const conn = new Client();

const runScript = `
echo "=== PM2 PROCESSES ==="
pm2 list

echo "=== DOCKER RUNNING CONTAINERS ==="
docker ps

echo "=== ALL DOCKER CONTAINERS (including stopped) ==="
docker ps -a

echo "=== DOCKER VOLUMES ==="
docker volume ls

echo "=== DISK USAGE & RAM USAGE ==="
df -h
free -m
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
