import { Client } from 'ssh2';

const conn = new Client();

const cleanupScript = `
set -e

echo "=========================================="
echo " STEP 1: BACKUP POSTGRESQL ACCOUNT_PRO DB "
echo "=========================================="
pg_dump -U postgres -d account_pro | gzip > /root/backup_postgres_account_pro_$(date +%Y%m%d_%H%M%S).sql.gz
echo "✅ PostgreSQL backup created:"
ls -lh /root/backup_postgres_*.sql.gz

echo ""
echo "=========================================="
echo " STEP 2: BACKUP APPWRITE MARIADB ARCHIVE  "
echo "=========================================="
if docker ps -a | grep -q appwrite-mariadb; then
    echo "Starting appwrite-mariadb temporarily for mysqldump..."
    docker start appwrite-mariadb || true
    sleep 5
    docker exec appwrite-mariadb mysqldump -u root -proot_secret --all-databases 2>/dev/null | gzip > /root/backup_appwrite_mariadb_$(date +%Y%m%d_%H%M%S).sql.gz || echo "mysqldump skipped or done"
    docker stop appwrite-mariadb || true
fi
echo "✅ Appwrite MariaDB backup created (if existed):"
ls -lh /root/backup_appwrite_*.sql.gz 2>/dev/null || echo "No mariadb backup"

echo ""
echo "=========================================="
echo " STEP 3: REMOVE APPWRITE DOCKER CONTAINERS"
echo "=========================================="
CONTAINERS=$(docker ps -aq)
if [ -n "$CONTAINERS" ]; then
    echo "Removing containers: $CONTAINERS"
    docker rm -f $CONTAINERS
else
    echo "No containers to remove."
fi

echo ""
echo "=========================================="
echo " STEP 4: REMOVE APPWRITE DOCKER VOLUMES   "
echo "=========================================="
VOLUMES=$(docker volume ls -q)
if [ -n "$VOLUMES" ]; then
    echo "Removing volumes: $VOLUMES"
    docker volume rm -f $VOLUMES || true
else
    echo "No volumes to remove."
fi

echo ""
echo "=========================================="
echo " STEP 5: PRUNE UNUSED DOCKER IMAGES & DATA"
echo "=========================================="
docker system prune -a -f --volumes || true

echo ""
echo "=========================================="
echo " STEP 6: FINAL DISK & RAM STATUS          "
echo "=========================================="
echo "--- DOCKER CONTAINERS ---"
docker ps -a
echo "--- DOCKER DISK USAGE ---"
docker system df
echo "--- SYSTEM DISK USAGE ---"
df -h /
echo "--- SYSTEM MEMORY USAGE ---"
free -m

echo ""
echo "=========================================="
echo "          CLEANUP COMPLETE! 🚀            "
echo "=========================================="
`;

conn.on('ready', () => {
    conn.exec(cleanupScript, (err, stream) => {
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
