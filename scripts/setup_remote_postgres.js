import { Client } from "ssh2";

const conn = new Client();

conn.on("ready", () => {
    console.log("SSH Connection :: ready");
    
    // Commands to run on the VPS:
    // 1. Check if postgresql is running
    // 2. Set postgres password or create user / database
    // 3. Configure postgresql.conf and pg_hba.conf if needed
    // 4. Restart postgresql
    const commands = `
echo "=== 1. Checking PostgreSQL service ==="
systemctl status postgresql --no-pager || systemctl status postgres --no-pager || docker ps | grep postgres

echo "=== 2. Creating Database & User in PostgreSQL ==="
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'AccountPro@2026!';"
sudo -u postgres psql -c "CREATE DATABASE account_pro;" || echo "DB might already exist"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE account_pro TO postgres;"

echo "=== 3. Checking pg_hba.conf and listen_addresses ==="
PG_CONF=$(sudo -u postgres psql -t -P format=unaligned -c "SHOW config_file;")
PG_HBA=$(sudo -u postgres psql -t -P format=unaligned -c "SHOW hba_file;")
echo "config_file: $PG_CONF"
echo "hba_file: $PG_HBA"

if [ -f "$PG_CONF" ]; then
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" "$PG_CONF"
    sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/g" "$PG_CONF"
fi

if [ -f "$PG_HBA" ]; then
    grep -q "host all all 0.0.0.0/0 md5" "$PG_HBA" || echo "host all all 0.0.0.0/0 md5" >> "$PG_HBA"
    grep -q "host all all 0.0.0.0/0 scram-sha-256" "$PG_HBA" || echo "host all all 0.0.0.0/0 scram-sha-256" >> "$PG_HBA"
fi

echo "=== 4. Reloading PostgreSQL ==="
sudo -u postgres psql -c "SELECT pg_reload_conf();" || systemctl restart postgresql

echo "=== 5. Verifying databases ==="
sudo -u postgres psql -c "\\l"
`;

    conn.exec(commands, (err, stream) => {
        if (err) throw err;
        stream.on("close", (code, signal) => {
            console.log(`SSH Stream :: close :: code: ${code}`);
            conn.end();
        }).on("data", (data) => {
            process.stdout.write(data);
        }).stderr.on("data", (data) => {
            process.stderr.write(data);
        });
    });
}).connect({
    host: "42.96.15.241",
    port: 26266,
    username: "root",
    password: "Xij:^_^8!"
});
