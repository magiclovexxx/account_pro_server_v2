import { Client } from 'ssh2';

const conn = new Client();

const dumpPassCommands = `
docker start appwrite-mariadb
sleep 3
echo "=== TABLES IN APPWRITE MARIADB ==="
docker exec appwrite-mariadb mysql -u user -ppassword appwrite -e "SHOW TABLES LIKE '%user%';"

echo "=== DUMPING USERS TABLE ==="
docker exec appwrite-mariadb mysql -u user -ppassword appwrite -e "
SELECT _id, email, password, passwordUpdate, passwordHistory, status FROM _project_console_users;
" || true

docker exec appwrite-mariadb mysql -u user -ppassword appwrite -e "
SELECT _id, email, password, passwordUpdate, passwordHistory, status FROM _project_68f86f87000e3ee9e5bc_users;
" || true

# Hoặc tìm tất cả các bảng users
docker exec appwrite-mariadb mysql -u user -ppassword appwrite -e "
SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA='appwrite' AND TABLE_NAME LIKE '%users%';
" | while read tbl; do
    if [ "\$tbl" != "TABLE_NAME" ]; then
        echo "=== DUMP FROM \$tbl ==="
        docker exec appwrite-mariadb mysql -u user -ppassword appwrite -e "SELECT _id, email, password, passwordUpdate FROM \$tbl;" || true
    fi
done

docker stop appwrite-mariadb
`;

conn.on('ready', () => {
    console.log('SSH Client :: dumping Appwrite user hashes');
    conn.exec(dumpPassCommands, (err, stream) => {
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
    readyTimeout: 60000
});
