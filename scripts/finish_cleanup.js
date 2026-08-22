import { Client } from 'ssh2';

const conn = new Client();

const script = `
echo "=== 1. PERFORM ACCURATE POSTGRESQL BACKUP ==="
sudo -u postgres pg_dump account_pro | gzip > /root/backup_postgres_account_pro_$(date +%Y%m%d_%H%M%S).sql.gz
ls -lh /root/backup_postgres_*.sql.gz

echo "=== 2. COMPLETE DOCKER SYSTEM PRUNE ==="
docker system prune -a -f --volumes || true

echo "=== 3. CHECK DOCKER STATUS & DISK SPACE ==="
echo "--- Docker PS ---"
docker ps -a

echo "--- Docker System DF ---"
docker system df

echo "--- VPS DISK USAGE ---"
df -h /

echo "--- VPS RAM USAGE ---"
free -m
`;

conn.on('ready', () => {
    conn.exec(script, (err, stream) => {
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
    readyTimeout: 30000
});
