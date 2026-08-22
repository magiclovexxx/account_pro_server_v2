import { Client } from 'ssh2';

const conn = new Client();
const cmd = `cd /home/account_pro_server_v2 && node -e '
import fs from "fs";
import { google } from "googleapis";

async function testGAMAuth() {
    if (!fs.existsSync("account.json")) {
        console.log("❌ account.json not found on VPS!");
        return;
    }
    console.log("✅ account.json found on VPS!");
    const keyFile = JSON.parse(fs.readFileSync("account.json", "utf-8"));
    console.log("Client email:", keyFile.client_email);
    const auth = new google.auth.GoogleAuth({
        credentials: keyFile,
        scopes: ["https://www.googleapis.com/auth/admanager"],
    });
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    console.log("✅ Google OAuth Token successfully generated! Token prefix:", tokenResp.token?.slice(0, 25) + "...");
}

testGAMAuth().catch(err => console.error("❌ GAM Auth error:", err.message));
'`;

conn.on('ready', () => {
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('close', (code, signal) => {
            console.log(output);
            conn.end();
            process.exit(0);
        }).on('data', (data) => {
            output += data.toString();
        }).stderr.on('data', (data) => {
            output += data.toString();
        });
    });
}).connect({
    host: '42.96.15.241',
    port: 26266,
    username: 'root',
    password: 'Xij:^_^8!',
    readyTimeout: 20000
});
