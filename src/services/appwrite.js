// appwriteClient.js
import { Client, Databases, ID, Query } from "node-appwrite";
import dotenv from "dotenv";
dotenv.config();

const server = process.env.SERVER;
let client = null;
let databases = null;
const dbId = process.env.APPWRITE_DATABASE_ID;

if (process.env.APPWRITE_ENDPOINT && process.env.APPWRITE_PROJECT_ID && process.env.APPWRITE_API_KEY) {
    client = new Client()
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setKey(process.env.APPWRITE_API_KEY);
    databases = new Databases(client);
}

function cleanDocument(doc) {
    const clean = {};
    for (const key in doc) {
        if (!key.startsWith("$")) {
            clean[key] = doc[key];
        }
    }
    return clean;
}

/**
 * 🔹 CRUD tổng quát cho mọi collection
 */
export const appwriteCRUD = {
    async list(collectionId) {
        if (!databases) return [];
        try {
            const res = await databases.listDocuments(dbId, collectionId);
            return res.documents;
        } catch (err) {
            console.error(`❌ list() lỗi: ${err.message}`);
            throw err;
        }
    },

    async get(collectionId, docId) {
        if (!databases) return null;
        try {
            return await databases.getDocument(dbId, collectionId, docId);
        } catch (err) {
            console.error(`❌ get() lỗi: ${err.message}`);
            throw err;
        }
    },

    async create(collectionId, data) {
        if (!databases) return null;
        try {
            return await databases.createDocument(
                dbId,
                collectionId,
                ID.unique(),
                data
            );
        } catch (err) {
            console.error(`❌ create() lỗi: ${err.message}`);
            throw err;
        }
    },

    async update(collectionId, docId, data) {
        if (!databases) return null;
        try {
            const cleanData = cleanDocument(data);
            return await databases.updateDocument(
                dbId,
                collectionId,
                docId,
                cleanData
            );
        } catch (err) {
            console.error(`❌ update() lỗi: ${err.message}`);
            throw err;
        }
    },

    async remove(collectionId, docId) {
        if (!databases) return { success: false };
        try {
            await databases.deleteDocument(dbId, collectionId, docId);
            return { success: true };
        } catch (err) {
            console.error(`❌ remove() lỗi: ${err.message}`);
            throw err;
        }
    },

    async getOldestVideoWithTool(number_video = 1, serverName = server) {
        if (!databases) return [];
        try {
            const completedRes = await databases.listDocuments(
                dbId,
                "video_generations",
                [
                    Query.equal("status", "completed"),
                    Query.orderDesc("completionDate"),
                    Query.limit(50),
                ]
            );
            const completedProjectIds = [
                ...new Set(
                    completedRes.documents.map((d) => d.projectId).filter(Boolean)
                ),
            ];

            const candidateLimit = Math.max(number_video * 5, number_video);
            const candidatesRes = await databases.listDocuments(
                dbId,
                "video_generations",
                [
                    Query.or([
                        Query.equal("status", "queued"),
                        Query.equal("status", "failed"),
                        Query.and([
                            Query.equal("status", "processing"),
                            Query.equal("server", serverName),
                        ]),
                    ]),
                    Query.or([
                        Query.isNull("server"),
                        Query.equal("server", ""),
                        Query.equal("server", serverName),
                    ]),
                    Query.orderAsc("creationDate"),
                    Query.limit(candidateLimit),
                ]
            );

            const candidates = candidatesRes.documents || [];
            if (!candidates.length) {
                console.log("Không có video thỏa điều kiện.");
                return [];
            }

            const prioritized = candidates.filter((v) =>
                completedProjectIds.includes(v.projectId)
            );
            const selected = [];
            const usedIds = new Set();

            for (const v of prioritized) {
                if (selected.length >= number_video) break;
                selected.push(v);
                usedIds.add(v.$id);
            }

            if (selected.length < number_video) {
                for (const v of candidates) {
                    if (selected.length >= number_video) break;
                    if (usedIds.has(v.$id)) continue;
                    selected.push(v);
                    usedIds.add(v.$id);
                }
            }

            if (!selected.length) {
                console.log("Sau lọc vẫn không có video được chọn.");
                return [];
            }

            const results = [];
            for (const video of selected) {
                try {
                    const updatedVideo = await databases.updateDocument(
                        dbId,
                        "video_generations",
                        video.$id,
                        {
                            server: serverName,
                            status: "processing",
                        }
                    );

                    let toolDoc = null;
                    try {
                        const toolRes = await databases.listDocuments(
                            dbId,
                            "tool_accounts",
                            [
                                Query.equal("userId", updatedVideo.userId),
                                Query.equal("tool", "veo3"),
                                Query.limit(1),
                            ]
                        );
                        if (toolRes.documents.length) toolDoc = toolRes.documents[0];
                    } catch (errTool) {
                        console.warn(
                            `Lỗi khi lấy tool_account cho user ${updatedVideo.userId}:`,
                            errTool.message
                        );
                    }

                    const merged = { ...updatedVideo, toolAccount: toolDoc || null };
                    results.push(merged);
                } catch (err) {
                    console.error(`Lỗi update/lock video ${video.$id}:`, err.message);
                    continue;
                }
            }

            return results;
        } catch (error) {
            console.error("Lỗi trong getOldestVideoWithTool:", error.message);
            return [];
        }
    },

    async getToolAccount(tool) {
        if (!databases) return null;
        try {
            const toolRes = await databases.listDocuments(dbId, "tool_accounts", [
                Query.equal("userId", "68d3a7c8003cc52a6274"),
                Query.equal("tool", tool),
                Query.equal("status", true),
                Query.limit(1),
            ]);
            let toolDoc;
            if (toolRes.documents.length) {
                toolDoc = toolRes.documents[0];
            }
            return toolDoc;
        } catch (errTool) {
            console.warn(`Lỗi khi lấy tool_account cho user `, errTool);
        }
    },
};
