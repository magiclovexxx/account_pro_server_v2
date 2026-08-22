import crypto from 'crypto';

const keyStr = 'your-secret-key';
// In Appwrite PHP (OpenSSL): if key is shorter than 16 bytes, PHP pads it with \0 or truncates to 16 bytes
const key = Buffer.alloc(16, 0);
Buffer.from(keyStr, 'utf-8').copy(key);

const sampleEncrypted = {
    "data": "2wE1V7Eb42itdtFx1hCvCyWVDkQNDuSv+4qCV0Z9szn9EVtDT66R4zIMfelJicsvqU+lw7OzicSQbDg1OmCFbWSABZNk1VWAFDzmb3lrTKpySCh0gznV1e11sktzleJtAw==",
    "method": "aes-128-gcm",
    "iv": "bd3c0927d1a298a13f8aad70",
    "tag": "3cbcc1097dd70fdf342e8ea2c71d425a",
    "version": "1"
};

try {
    const decipher = crypto.createDecipheriv(
        'aes-128-gcm',
        key,
        Buffer.from(sampleEncrypted.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(sampleEncrypted.tag, 'hex'));
    let decrypted = decipher.update(Buffer.from(sampleEncrypted.data, 'base64'), null, 'utf8');
    decrypted += decipher.final('utf8');
    console.log("✅ Decrypted hash:", decrypted);
} catch (err) {
    console.error("❌ Decrypt error:", err.message);
}
