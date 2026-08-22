import { Client } from 'ssh2';

const conn = new Client();

const migrateScript = `
cat << 'EOF' > /home/account_pro_server_v2/sync_appwrite_passwords.js
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';

const prisma = new PrismaClient();
const keyStr = 'your-secret-key';
const aesKey = Buffer.alloc(16, 0);
Buffer.from(keyStr, 'utf-8').copy(aesKey);

function decryptPassword(encryptedJsonStr) {
    if (!encryptedJsonStr) return null;
    try {
        const parsed = JSON.parse(encryptedJsonStr);
        if (!parsed.data || !parsed.iv || !parsed.tag) return null;

        const decipher = crypto.createDecipheriv(
            'aes-128-gcm',
            aesKey,
            Buffer.from(parsed.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
        let decrypted = decipher.update(Buffer.from(parsed.data, 'base64'), null, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error("Decrypt error:", err.message);
        return null;
    }
}

async function run() {
    console.log("1. Connecting to Appwrite MariaDB...");
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3306,
        user: 'user',
        password: 'password',
        database: 'appwrite'
    });

    const tables = ['_project_console_users', '_project_68f86f87000e3ee9e5bc_users', '_4_users', '_7_users'];
    const userMap = new Map(); // email -> argon2Hash

    for (const tbl of tables) {
        try {
            const [rows] = await connection.execute(\`SELECT email, password FROM \${tbl} WHERE email IS NOT NULL AND password IS NOT NULL;\`);
            console.log(\`Found \${rows.length} rows in \${tbl}\`);
            for (const r of rows) {
                const email = r.email.trim().toLowerCase();
                const decryptedHash = decryptPassword(r.password);
                if (decryptedHash && (decryptedHash.startsWith('$argon2') || decryptedHash.startsWith('$2'))) {
                    userMap.set(email, decryptedHash);
                    console.log(\`✅ Decrypted password for \${email}: \${decryptedHash.slice(0, 30)}...\`);
                }
            }
        } catch (e) {
            console.log(\`Table \${tbl} not accessible or does not exist: \${e.message}\`);
        }
    }

    await connection.end();

    console.log(\`\\n2. Updating \${userMap.size} user passwords in PostgreSQL...\`);
    let updatedCount = 0;
    for (const [email, hash] of userMap.entries()) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
            await prisma.user.update({
                where: { email },
                data: { password: hash }
            });
            updatedCount++;
            console.log(\`✅ Updated PostgreSQL user \${email} (\${user.id}) with original Appwrite hash\`);
        } else {
            console.log(\`ℹ️ User \${email} exists in MariaDB but not in PostgreSQL\`);
        }
    }

    console.log(\`\\n🎉 HOÀN TẤT ĐỒNG BỘ MẬT KHẨU CŨ: \${updatedCount} users đã được cập nhật mật khẩu gốc từ Appwrite!\`);
    process.exit(0);
}

run().catch(e => {
    console.error("Migration error:", e);
    process.exit(1);
});
EOF

echo "--- Starting MariaDB temporarily for migration ---"
docker start appwrite-mariadb
sleep 3

cd /home/account_pro_server_v2
npm install mysql2 argon2
node sync_appwrite_passwords.js
rm sync_appwrite_passwords.js

echo "--- Stopping MariaDB again ---"
docker stop appwrite-mariadb
`;

conn.on('ready', () => {
    console.log('SSH Client :: running real password synchronization from Appwrite MariaDB to PostgreSQL');
    conn.exec(migrateScript, (err, stream) => {
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
