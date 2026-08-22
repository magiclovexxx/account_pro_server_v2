import { Client } from 'ssh2';

const conn = new Client();

const findAppwriteCompose = `
echo "=== DOCKER INSPECT APPWRITE ENV ==="
docker inspect appwrite | grep -i "_app_db" || true
echo "=== FINDING COMPOSE FILES ==="
find / -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null || true
`;

conn.on('ready', () => {
    conn.exec(findAppwriteCompose, (err, stream) => {
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
