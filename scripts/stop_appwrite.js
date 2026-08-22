import { Client } from 'ssh2';

const conn = new Client();

const stopAppwriteCommands = `
echo "=========================================="
echo "🛑 STOPPING APPWRITE CONTAINERS..."
echo "=========================================="
cd /root/appwrite || cd /root
docker compose down || docker stop $(docker ps -a -q --filter name=appwrite) || true
docker ps
echo "=========================================="
echo "✅ APPWRITE CONTAINERS STOPPED!"
echo "=========================================="
`;

conn.on('ready', () => {
    console.log('SSH Client :: stopping Appwrite');
    conn.exec(stopAppwriteCommands, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log(`Command closed with code: ${code}`);
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
