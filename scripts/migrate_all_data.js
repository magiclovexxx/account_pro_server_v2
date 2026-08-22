import { Client, Databases, Users, Query } from "node-appwrite";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

const appwriteClient = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(appwriteClient);
const appwriteUsers = new Users(appwriteClient);
const dbId = process.env.APPWRITE_DATABASE_ID;

function parseDate(d) {
    if (!d) return null;
    const date = new Date(d);
    return isNaN(date.getTime()) ? null : date;
}

async function fetchAllDocuments(collectionId) {
    let all = [];
    let lastId = null;
    let page = 1;
    while (true) {
        const queries = [Query.limit(100)];
        if (lastId) {
            queries.push(Query.cursorAfter(lastId));
        }
        process.stdout.write(`  [${collectionId}] Tải trang ${page}... `);
        const res = await databases.listDocuments(dbId, collectionId, queries);
        all = all.concat(res.documents);
        process.stdout.write(`Đã lấy ${all.length}/${res.total}\n`);
        if (all.length >= res.total || res.documents.length === 0) {
            break;
        }
        lastId = res.documents[res.documents.length - 1].$id;
        page++;
    }
    return all;
}

async function migrate() {
    console.log("🚀 Bắt đầu quá trình di chuyển 100% dữ liệu từ Appwrite sang PostgreSQL...");

    // 1. Roles
    console.log("\n[1/10] Di chuyển Roles...");
    const rawRoles = await fetchAllDocuments("roles");
    for (const r of rawRoles) {
        await prisma.role.upsert({
            where: { id: r.$id },
            update: { role: r.role || "client" },
            create: { id: r.$id, role: r.role || "client" }
        });
    }
    console.log(`✅ Đã di chuyển ${rawRoles.length} roles.`);

    // 2. Plans
    console.log("\n[2/10] Di chuyển Plans...");
    const rawPlans = await fetchAllDocuments("plans");
    for (const p of rawPlans) {
        await prisma.plan.upsert({
            where: { id: p.$id },
            update: {
                name: p.name,
                options: p.options,
                status: p.status,
                isOnline: p.isOnline || false,
                permission: p.permission,
                price: p.price,
                days: p.days
            },
            create: {
                id: p.$id,
                name: p.name,
                options: p.options,
                status: p.status,
                isOnline: p.isOnline || false,
                permission: p.permission,
                price: p.price,
                days: p.days
            }
        });
    }
    console.log(`✅ Đã di chuyển ${rawPlans.length} plans.`);

    // 3. Users
    console.log("\n[3/10] Di chuyển Users...");
    const authList = await appwriteUsers.list();
    const rawUsers = await fetchAllDocuments("users");
    const userProfileMap = new Map();
    for (const doc of rawUsers) {
        const uId = doc.userId || doc.$id;
        userProfileMap.set(uId, doc);
    }

    const defaultPasswordHash = await bcrypt.hash("12345678", 10);

    for (const u of authList.users) {
        const profile = userProfileMap.get(u.$id) || {};
        const userId = u.$id;
        const email = (u.email || profile.email || `${userId}@example.com`).toLowerCase();
        const name = u.name || profile.name || email.split("@")[0];

        await prisma.user.upsert({
            where: { id: userId },
            update: {
                email,
                name,
                phone: u.phone || profile.phone || null,
                plan: profile.plan || "free",
                role: profile.role || "user",
                settings: typeof profile.settings === "object" ? JSON.stringify(profile.settings) : profile.settings || null,
                permission: profile.permission || null,
                usage: typeof profile.usage === "object" ? JSON.stringify(profile.usage) : profile.usage || null,
                credits: profile.credits !== undefined ? profile.credits : 10,
                subscriptionStatus: profile.subscriptionStatus || "trial",
                subscriptionEndDate: parseDate(profile.subscriptionEndDate),
                expireDate: parseDate(profile.expireDate),
                devices: Array.isArray(profile.devices) ? profile.devices : [],
                max_device: profile.max_device || 1,
                updatedAt: parseDate(profile.$updatedAt) || new Date()
            },
            create: {
                id: userId,
                email,
                password: defaultPasswordHash,
                name,
                phone: u.phone || profile.phone || null,
                plan: profile.plan || "free",
                role: profile.role || "user",
                settings: typeof profile.settings === "object" ? JSON.stringify(profile.settings) : profile.settings || null,
                permission: profile.permission || null,
                usage: typeof profile.usage === "object" ? JSON.stringify(profile.usage) : profile.usage || null,
                credits: profile.credits !== undefined ? profile.credits : 10,
                subscriptionStatus: profile.subscriptionStatus || "trial",
                subscriptionEndDate: parseDate(profile.subscriptionEndDate),
                expireDate: parseDate(profile.expireDate),
                devices: Array.isArray(profile.devices) ? profile.devices : [],
                max_device: profile.max_device || 1,
                createdAt: parseDate(u.$createdAt || profile.$createdAt) || new Date(),
                updatedAt: parseDate(u.$updatedAt || profile.$updatedAt) || new Date()
            }
        });
    }
    console.log(`✅ Đã di chuyển ${authList.users.length} Users.`);

    // 4. Tools
    console.log("\n[4/10] Di chuyển Tools...");
    const rawTools = await fetchAllDocuments("listTool");
    for (const t of rawTools) {
        let userExists = null;
        if (t.userId) {
            userExists = await prisma.user.findUnique({ where: { id: t.userId } });
        }
        await prisma.tool.upsert({
            where: { id: t.$id },
            update: {
                userId: userExists ? t.userId : null,
                name: t.name,
                url: t.url,
                username: t.username,
                password: t.password,
                desc: t.desc,
                cookie: t.cookie,
                price: t.price || 0,
                type: t.type,
                status: t.status !== undefined ? t.status : true,
                expriration_date: parseDate(t.expriration_date),
                package: Array.isArray(t.package) ? t.package : (t.package ? [t.package] : []),
                updatedAt: parseDate(t.$updatedAt) || new Date()
            },
            create: {
                id: t.$id,
                userId: userExists ? t.userId : null,
                name: t.name,
                url: t.url,
                username: t.username,
                password: t.password,
                desc: t.desc,
                cookie: t.cookie,
                price: t.price || 0,
                type: t.type,
                status: t.status !== undefined ? t.status : true,
                expriration_date: parseDate(t.expriration_date),
                package: Array.isArray(t.package) ? t.package : (t.package ? [t.package] : []),
                createdAt: parseDate(t.$createdAt) || new Date(),
                updatedAt: parseDate(t.$updatedAt) || new Date()
            }
        });
    }
    console.log(`✅ Đã di chuyển ${rawTools.length} Tools.`);

    // 5. Coupons
    console.log("\n[5/10] Di chuyển Coupons...");
    const rawCoupons = await fetchAllDocuments("coupon");
    for (const c of rawCoupons) {
        let userExists = null;
        if (c.userId) {
            userExists = await prisma.user.findUnique({ where: { id: c.userId } });
        }
        await prisma.coupon.upsert({
            where: { id: c.$id },
            update: {
                userId: userExists ? c.userId : null,
                title: c.title,
                code: c.code,
                desc: c.desc,
                percent: c.percent !== undefined ? Number(c.percent) : 0,
                percentOfUser: c.percentOfUser !== undefined ? Number(c.percentOfUser) : 0,
                count: c.count || 0,
                max_user: c.max_user || 0,
                type: c.type,
                reUsed: c.reUsed || false,
                status: c.status !== undefined ? c.status : true,
                expriration_date: parseDate(c.expriration_date),
                updatedAt: parseDate(c.$updatedAt) || new Date()
            },
            create: {
                id: c.$id,
                userId: userExists ? c.userId : null,
                title: c.title,
                code: c.code,
                desc: c.desc,
                percent: c.percent !== undefined ? Number(c.percent) : 0,
                percentOfUser: c.percentOfUser !== undefined ? Number(c.percentOfUser) : 0,
                count: c.count || 0,
                max_user: c.max_user || 0,
                type: c.type,
                reUsed: c.reUsed || false,
                status: c.status !== undefined ? c.status : true,
                expriration_date: parseDate(c.expriration_date),
                createdAt: parseDate(c.$createdAt) || new Date(),
                updatedAt: parseDate(c.$updatedAt) || new Date()
            }
        });
    }
    console.log(`✅ Đã di chuyển ${rawCoupons.length} Coupons.`);

    // 6. Orders
    console.log("\n[6/10] Di chuyển Orders...");
    const rawOrders = await fetchAllDocuments("orders");
    for (const o of rawOrders) {
        let userExists = null;
        if (o.userId) {
            userExists = await prisma.user.findUnique({ where: { id: o.userId } });
        }
        let toolExists = null;
        if (o.toolId) {
            toolExists = await prisma.tool.findUnique({ where: { id: o.toolId } });
        }

        await prisma.order.upsert({
            where: { id: o.$id },
            update: {
                userId: userExists ? o.userId : null,
                toolId: toolExists ? o.toolId : null,
                orderId: o.orderId,
                price: o.price || 0,
                type: o.type,
                note: o.note,
                method: o.method,
                isPurchased: o.isPurchased,
                expriration_date: parseDate(o.expriration_date),
                status: o.status !== undefined ? o.status : true,
                max_device: o.max_device || 1,
                devices: Array.isArray(o.devices) ? o.devices : [],
                paymentId: o.paymentId,
                updatedAt: parseDate(o.$updatedAt) || new Date()
            },
            create: {
                id: o.$id,
                userId: userExists ? o.userId : null,
                toolId: toolExists ? o.toolId : null,
                orderId: o.orderId,
                price: o.price || 0,
                type: o.type,
                note: o.note,
                method: o.method,
                isPurchased: o.isPurchased,
                expriration_date: parseDate(o.expriration_date),
                status: o.status !== undefined ? o.status : true,
                max_device: o.max_device || 1,
                devices: Array.isArray(o.devices) ? o.devices : [],
                paymentId: o.paymentId,
                createdAt: parseDate(o.$createdAt) || new Date(),
                updatedAt: parseDate(o.$updatedAt) || new Date()
            }
        });
    }
    console.log(`✅ Đã di chuyển ${rawOrders.length} Orders.`);

    // 7. Payments
    console.log("\n[7/10] Di chuyển Payments...");
    const rawPayments = await fetchAllDocuments("payments");
    for (const p of rawPayments) {
        let userExists = null;
        if (p.userId) {
            userExists = await prisma.user.findUnique({ where: { id: p.userId } });
        }
        await prisma.payment.upsert({
            where: { id: p.$id },
            update: {
                userId: userExists ? p.userId : null,
                toolId: p.toolId,
                package: typeof p.package === "object" ? JSON.stringify(p.package) : p.package,
                deviceCount: p.deviceCount,
                originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
                amount: p.amount ? Number(p.amount) : 0,
                discount: p.discount ? Number(p.discount) : 0,
                couponCode: p.couponCode,
                method: p.method,
                transaction: p.transaction,
                orderId: p.orderId,
                isPurchased: p.isPurchased,
                sepayTransaction: p.sepayTransaction,
                contentPayment: p.contentPayment,
                updatedAt: parseDate(p.$updatedAt) || new Date()
            },
            create: {
                id: p.$id,
                userId: userExists ? p.userId : null,
                toolId: p.toolId,
                package: typeof p.package === "object" ? JSON.stringify(p.package) : p.package,
                deviceCount: p.deviceCount,
                originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
                amount: p.amount ? Number(p.amount) : 0,
                discount: p.discount ? Number(p.discount) : 0,
                couponCode: p.couponCode,
                method: p.method,
                transaction: p.transaction,
                orderId: p.orderId,
                isPurchased: p.isPurchased,
                sepayTransaction: p.sepayTransaction,
                contentPayment: p.contentPayment,
                createdAt: parseDate(p.$createdAt) || new Date(),
                updatedAt: parseDate(p.$updatedAt) || new Date()
            }
        });
    }
    console.log(`✅ Đã di chuyển ${rawPayments.length} Payments.`);

    // 8. NetworkCodes
    console.log("\n[8/10] Di chuyển NetworkCodes...");
    const rawCodes = await fetchAllDocuments("networkCodes");
    for (const nc of rawCodes) {
        let userExists = null;
        if (nc.userId) {
            userExists = await prisma.user.findUnique({ where: { id: nc.userId } });
        }
        await prisma.networkCode.upsert({
            where: { id: nc.$id },
            update: {
                userId: userExists ? nc.userId : null,
                networkCode: nc.networkCode,
                title: nc.title,
                status: nc.status !== undefined ? nc.status : true,
                profit: nc.profit ? Number(nc.profit) : 0,
                getDataTime: parseDate(nc.getDataTime),
                updatedAt: parseDate(nc.$updatedAt) || new Date()
            },
            create: {
                id: nc.$id,
                userId: userExists ? nc.userId : null,
                networkCode: nc.networkCode,
                title: nc.title,
                status: nc.status !== undefined ? nc.status : true,
                profit: nc.profit ? Number(nc.profit) : 0,
                getDataTime: parseDate(nc.getDataTime),
                createdAt: parseDate(nc.$createdAt) || new Date(),
                updatedAt: parseDate(nc.$updatedAt) || new Date()
            }
        });
    }
    console.log(`✅ Đã di chuyển ${rawCodes.length} NetworkCodes.`);

    // 9. TradingConfigs
    console.log("\n[9/10] Di chuyển TradingConfigs...");
    const rawTradings = await fetchAllDocuments("trading");
    for (const tc of rawTradings) {
        let userExists = null;
        if (tc.userId) {
            userExists = await prisma.user.findUnique({ where: { id: tc.userId } });
        }
        await prisma.tradingConfig.upsert({
            where: { id: tc.$id },
            update: {
                userId: userExists ? tc.userId : null,
                title: tc.title,
                platform: tc.platform,
                config: typeof tc.config === "object" ? JSON.stringify(tc.config) : tc.config,
                status: tc.status || false,
                options: typeof tc.options === "object" ? JSON.stringify(tc.options) : tc.options,
                updatedAt: parseDate(tc.$updatedAt) || new Date()
            },
            create: {
                id: tc.$id,
                userId: userExists ? tc.userId : null,
                title: tc.title,
                platform: tc.platform,
                config: typeof tc.config === "object" ? JSON.stringify(tc.config) : tc.config,
                status: tc.status || false,
                options: typeof tc.options === "object" ? JSON.stringify(tc.options) : tc.options,
                createdAt: parseDate(tc.$createdAt) || new Date(),
                updatedAt: parseDate(tc.$updatedAt) || new Date()
            }
        });
    }
    console.log(`✅ Đã di chuyển ${rawTradings.length} TradingConfigs.`);

    // 10. AdsReports (adsReport) - 3,729+ documents
    console.log("\n[10/10] Di chuyển AdsReports (3,729+ bản ghi)...");
    const rawAds = await fetchAllDocuments("adsReport");
    console.log(`Đã tải về ${rawAds.length} bản ghi AdsReport từ Appwrite. Bắt đầu nạp vào PostgreSQL...`);

    const batchSize = 500;
    for (let i = 0; i < rawAds.length; i += batchSize) {
        const chunk = rawAds.slice(i, i + batchSize);
        const dataToInsert = chunk.map(r => ({
            id: r.$id,
            networkCode: r.networkCode,
            date: parseDate(r.date),
            ad_unit_name: r.ad_unit_name,
            site: r.site,
            options: typeof r.options === "object" ? JSON.stringify(r.options) : r.options,
            status: r.status,
            revenue: r.revenue !== undefined ? Number(r.revenue) : 0,
            impressions: r.impressions !== undefined ? Number(r.impressions) : 0,
            clicks: r.clicks !== undefined ? Number(r.clicks) : 0,
            ecpm: r.ecpm !== undefined ? Number(r.ecpm) : 0,
            createdAt: parseDate(r.$createdAt) || new Date(),
            updatedAt: parseDate(r.$updatedAt) || new Date()
        }));

        await prisma.adsReport.createMany({
            data: dataToInsert,
            skipDuplicates: true
        });
        console.log(`  -> Đã nạp ${Math.min(i + batchSize, rawAds.length)} / ${rawAds.length} bản ghi.`);
    }

    console.log("\n🎉 HOÀN TẤT DI CHUYỂN 100% DỮ LIỆU TỪ APPWRITE SANG POSTGRESQL THÀNH CÔNG!");
}

migrate()
    .catch((err) => {
        console.error("❌ Lỗi trong quá trình di chuyển:", err);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
