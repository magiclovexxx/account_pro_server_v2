import { Client } from 'ssh2';

const conn = new Client();

const syncAllUsersScript = `
echo "--- 1. Starting MariaDB container ---"
docker start appwrite-mariadb
sleep 3

cat << 'EOF' > /home/account_pro_server_v2/sync_all_users.js
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

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
        return null;
    }
}

async function run() {
    console.log("1. Finding all user tables in MariaDB...");
    const rawTables = execSync(
        \`docker exec appwrite-mariadb mysql -u user -ppassword appwrite -N -e "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA='appwrite' AND TABLE_NAME REGEXP '^_[0-9]+_users$';"\`,
        { encoding: 'utf-8' }
    );
    const tables = rawTables.split('\\n').map(t => t.trim()).filter(Boolean);
    console.log("Tables found:", tables);

    const userMap = new Map(); // email -> argon2Hash

    for (const tbl of tables) {
        try {
            const rawOutput = execSync(
                \`docker exec appwrite-mariadb mysql -u user -ppassword appwrite -N -e "SELECT email, password FROM \${tbl} WHERE email IS NOT NULL AND password IS NOT NULL;"\`,
                { encoding: 'utf-8' }
            );
            const lines = rawOutput.split('\\n').filter(Boolean);
            console.log(\`Found \${lines.length} user rows in \${tbl}\`);
            for (const line of lines) {
                const parts = line.split('\\t');
                if (parts.length < 2) continue;
                const email = parts[0].trim().toLowerCase();
                const encJson = parts[1].trim();
                const decryptedHash = decryptPassword(encJson);
                if (decryptedHash && (decryptedHash.startsWith('$argon2') || decryptedHash.startsWith('$2'))) {
                    userMap.set(email, decryptedHash);
                    console.log(\`✅ Decrypted original hash for \${email}: \${decryptedHash.slice(0, 35)}...\`);
                }
            }
        } catch (e) {
            console.log(\`Table \${tbl} error: \${e.message}\`);
        }
    }

    console.log(\`\\n2. Updating \${userMap.size} unique user passwords in PostgreSQL...\`);
    let updatedCount = 0;
    for (const [email, hash] of userMap.entries()) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
            await prisma.user.update({
                where: { email },
                data: { password: hash }
            });
            updatedCount++;
            console.log(\`✅ Updated user \${email} (\${user.id}) with original Appwrite hash\`);
        } else {
            console.log(\`ℹ️ User \${email} in MariaDB not present in PostgreSQL users list\`);
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

cd /home/account_pro_server_v2
git stash
git pull origin main
npm install
node sync_all_users.js
rm sync_all_users.js
pm2 restart account_pro_server

echo "--- 3. Stopping MariaDB again ---"
docker stop appwrite-mariadb
`;

conn.on('ready', () => {
    console.log('SSH Client :: syncing ALL Appwrite user passwords from all tables');
    conn.exec(syncAllUsersScript, (err, stream) => {
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
