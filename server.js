import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { appwriteCRUD } from "./src/services/appwrite.js";
import { videoGenerate } from "./src/services/video_generation.js";
import { Mutex } from 'async-mutex';

import router from './src/routes.js'

const mutex = new Mutex();
dotenv.config();

const number_generate = process.env.NUMBER;
const PORT = 6789;
const app = express();

// Middleware
app.use(cors());

// ⚡ Cho phép nhận body lớn (ảnh base64 có thể vài MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use("/api", router);
// Route test
app.get('/', (req, res) => {
    res.send("Server hoạt động OK ✅");

});
app.get('/api', (req, res) => {
    res.send("API hoạt động OK ✅");

});

// Khởi động server
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function genVideo() {
    if (mutex.isLocked()) {
        console.log("⚠️ genVideo đang chạy, bỏ qua lần gọi trùng.");
        return;
    }

    await mutex.runExclusive(async () => {
        try {
            const data = await appwriteCRUD.getOldestVideoWithTool(number_generate);
            console.log('Kết quả:', data.length);

            if (data.length > 0) {
                // ⚡ Tạo danh sách Promise chạy song song
                const tasks = data.map(async (v) => {
                    try {
                        console.log('🎬 Tạo video:', v.sceneTitle);
                        const dataGenerate = await videoGenerate.veo3(v);

                        if (dataGenerate.success) {
                            v.videoUrls = dataGenerate.videoUrls;
                            v.status = "completed";
                            v.errorMessage = "";
                            delete v.toolAccount;

                            await appwriteCRUD.update(v.$collectionId, v.$id, v);
                            console.log("✅ Update OK:", v.sceneTitle);
                        } else {
                            v.status = "error";
                            v.errorMessage = dataGenerate.error || "Lỗi không xác định";
                            await appwriteCRUD.update(v.$collectionId, v.$id, v);
                            console.log("❌ Lỗi khi tạo video:", v.sceneTitle);
                        }
                    } catch (err) {
                        console.error("⚠️ Lỗi khi xử lý video:", v.sceneTitle, err);
                    }
                });

                // ✅ Chờ tất cả video hoàn tất
                await Promise.all(tasks);
                console.log("🟢 Hoàn tất tất cả video.");
            }

        } catch (err) {
            console.error('❌ Lỗi trong genVideo:', err);
        }
    });

    // Nghỉ 30s rồi chạy vòng kế
    await delay(30_000);
    genVideo();
}

// Bắt đầu chạy vòng lặp an toàn
genVideo();

(async () => {

})();