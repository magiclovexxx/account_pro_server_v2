import { Client, Databases, Users } from "node-appwrite";

const client = new Client()
    .setEndpoint("https://host-appwrite.kingoftool.net/v1")
    .setProject("68f925ba0017199b6c35")
    .setKey("standard_8ead83afa03c694b3c1a999ac0d2c94cf7c57a4ca32e1ae5580e2a5bf84cedfddfbe8c9786814265ecb5fbfa928d71ab9eddfeaf0e24d3cea6d34d6100479f68f1f1c4890fdb10c40cfb903c6b65b39211237e75e9b5080599adb1d610a460d8475bef1aeef373258eddc6eebfcdb0cd39587d8a386f1e030f34b9383d9fe6e8");

const databases = new Databases(client);
const users = new Users(client);

async function main() {
    try {
        console.log("Connecting to Appwrite...");
        const collections = await databases.listCollections("accountPro");
        console.log(`\nFound ${collections.total} collections in database 'accountPro':`);
        for (const col of collections.collections) {
            const docs = await databases.listDocuments("accountPro", col.$id, []);
            console.log(`- ${col.name} [ID: ${col.$id}]: ${docs.total} documents`);
            if (docs.documents.length > 0) {
                console.log(`  Sample keys: ${Object.keys(docs.documents[0]).filter(k => !k.startsWith('$')).join(', ')}`);
            }
        }

        const userList = await users.list();
        console.log(`\nFound ${userList.total} Auth Users in Appwrite.`);
        for (const u of userList.users.slice(0, 5)) {
            console.log(`  User: ${u.name} (${u.email}) - ID: ${u.$id} - emailVerification: ${u.emailVerification}`);
        }
    } catch (err) {
        console.error("Error inspecting Appwrite:", err);
    }
}

main();
