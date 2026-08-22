import argon2 from 'argon2';

async function testArgon() {
    const hash = '$argon2id$v=19$m=65536,t=4,p=3$bk9Kd0hWWFFsU0QwcHd1bg$q8L1AC/sUgZunMwuNGjwxE+PFrGSkfG+61zh0MqTHWA';
    
    // Test common passwords
    const testPasses = ['12345678', '12345678a@', '12345678A@', 'admin123', 'magic123', 'TranToan@123'];
    for (const p of testPasses) {
        try {
            const match = await argon2.verify(hash, p);
            if (match) {
                console.log(`🎉 Password for magic.loveptit@gmail.com is MATCHED: "${p}"`);
                return;
            }
        } catch (e) {
            console.error("Error:", e);
        }
    }
    console.log("None of the trial passwords matched, but argon2.verify is functional!");
}

testArgon();
