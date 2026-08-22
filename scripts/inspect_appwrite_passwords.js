import { Client } from 'ssh2';

const conn = new Client();

const inspectMariaDBCommands = `
echo "=========================================="
echo "🔍 1. STARTING APPWRITE-MARIADB TEMPORARILY TO INSPECT USERS TABLE..."
echo "=========================================="
docker start appwrite-mariadb
sleep 3

echo "=========================================="
echo "📊 2. LISTING DATABASES IN APPWRITE-MARIADB"
echo "=========================================="
docker exec appwrite-mariadb mysql -u root -p$(docker exec appwrite-mariadb env | grep _APP_DB_ROOT_PASS | cut -d= -f2 || echo "rootsecret") -e "SHOW DATABASES;" || \
docker exec appwrite-mariadb mysql -u root -e "SHOW DATABASES;" || \
docker exec appwrite-mariadb mysql -uroot -proot -e "SHOW DATABASES;" || true

echo "=========================================="
echo "📊 3. SEARCHING USERS TABLE IN ALL DATABASES"
echo "=========================================="
docker exec appwrite-mariadb mysql -u root -e "
SELECT TABLE_SCHEMA, TABLE_NAME FROM information_schema.tables WHERE TABLE_NAME LIKE '%users%';
" || true

echo "=========================================="
echo "📊 4. DUMPING USER CREDENTIALS & HASHES"
echo "=========================================="
docker exec appwrite-mariadb mysql -u root -e "
SELECT TABLE_SCHEMA, TABLE_NAME FROM information_schema.tables WHERE TABLE_NAME LIKE '%users%';
" | while read schema table; do
  if [ "\$table" != "TABLE_NAME" ]; then
    echo "--- \$schema.\$table ---"
    docker exec appwrite-mariadb mysql -u root -e "SELECT _id, email, password, passwordUpdate FROM \$schema.\$table;" || true
  fi
done

docker stop appwrite-mariadb
`;

conn.on('ready', () => {
    console.log('SSH Client :: inspecting Appwrite MariaDB for old password hashes');
    conn.exec(inspectMariaDBCommands, (err, stream) => {
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
