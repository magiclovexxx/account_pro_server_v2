// appwriteClient.js
import { Client, Databases, ID, Query } from "node-appwrite";
import dotenv from "dotenv";
dotenv.config();
const server = process.env.SERVER;
// ✅ Khởi tạo client Appwrite
const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const dbId = process.env.APPWRITE_DATABASE_ID;

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
    /**
     * Lấy tất cả document trong collection
     * @param {string} collectionId
     */
    async list(collectionId) {
        try {
            const res = await databases.listDocuments(dbId, collectionId);
            return res.documents;
        } catch (err) {
            console.error(`❌ list() lỗi: ${err.message}`);
            throw err;
        }
    },

    /**
     * Lấy 1 document theo ID
     * @param {string} collectionId
     * @param {string} docId
     */
    async get(collectionId, docId) {
        try {
            return await databases.getDocument(dbId, collectionId, docId);
        } catch (err) {
            console.error(`❌ get() lỗi: ${err.message}`);
            throw err;
        }
    },

    /**
     * Tạo mới document
     * @param {string} collectionId
     * @param {object} data
     */
    async create(collectionId, data) {
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

    /**
     * Cập nhật document
     * @param {string} collectionId
     * @param {string} docId
     * @param {object} data
     */
    async update(collectionId, docId, data) {
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

    /**
     * Xóa document
     * @param {string} collectionId
     * @param {string} docId
     */
    async remove(collectionId, docId) {
        try {
            await databases.deleteDocument(dbId, collectionId, docId);
            return { success: true };
        } catch (err) {
            console.error(`❌ remove() lỗi: ${err.message}`);
            throw err;
        }
    },

    /**
     * Lấy danh sách video_generations (status queued/failed),
     * update thành server_1 + processing,
     * rồi lấy tool_account tương ứng của userId.
     */
    async getOldestVideoWithTool(number_video = 1, serverName = server) {
        try {
            // 1) Lấy danh sách projectId đã có video completed gần đây (dùng để ưu tiên)
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

            // 2) Lấy pool candidate videos:
            // - status queued OR failed
            // - OR (status processing AND server = serverName)
            // - đồng thời chỉ lấy video mà server là null/empty/hoặc server == serverName (loại server khác)
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
                    // server null/empty hoặc server == serverName
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

            // 3) Ưu tiên theo projectId (những video có projectId thuộc completedProjectIds)
            const prioritized = candidates.filter((v) =>
                completedProjectIds.includes(v.projectId)
            );
            const selected = [];
            const usedIds = new Set();

            // Lấy trước những video ưu tiên
            for (const v of prioritized) {
                if (selected.length >= number_video) break;
                selected.push(v);
                usedIds.add(v.$id);
            }

            // Nếu chưa đủ, bổ sung từ pool candidates theo thứ tự creationDate
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

            // 4) Với từng selected video: update để lock (server, status) => lấy tool_account => merge
            const results = [];
            for (const video of selected) {
                try {
                    // Update để lock. Nếu video đã bị gán server khác, update có thể thành công hoặc lỗi tùy data.
                    const updatedVideo = await databases.updateDocument(
                        dbId,
                        "video_generations",
                        video.$id,
                        {
                            server: serverName,
                            status: "processing",
                        }
                    );

                    // Lấy tool_account tương ứng
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
                        // tiếp tục, toolAccount = null
                    }

                    // Merge: giữ toàn bộ fields của updatedVideo, thêm key toolAccount
                    const merged = { ...updatedVideo, toolAccount: toolDoc || null };
                    results.push(merged);
                } catch (err) {
                    // Nếu update fail (ví dụ bị lock bởi worker khác), log và bỏ video này
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
        try {
            console.log("get tool: ", tool)
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
            // tiếp tục, toolAccount = null
        }
    },
};
