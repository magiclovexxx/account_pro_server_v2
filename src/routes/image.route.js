import express from 'express';
const router = express.Router();
import fs from 'fs';
import path from 'path';
import { videoGenerate } from "../services/video_generation.js";
// Route POST /generate_image
router.post('/generate_image', async (req, res) => {
    try {
        const dataGen = req.body;
        const { prompt, aspectRatio, referenceImages = [] } = dataGen;

        if (!prompt) return res.status(400).json({ error: "Thiếu prompt" });
        // if (!Array.isArray(referenceImages) || referenceImages.length === 0) {
        //   return res.status(400).json({ error: "Thiếu referenceImages" });
        // }

        // 📁 Thư mục lưu ảnh
        const downloadsDir = path.join(process.cwd(), 'downloads');
        fs.mkdirSync(downloadsDir, { recursive: true });

        // ✅ Giải mã từng ảnh base64 và lưu
        const imagePaths = [];
        if (Array.isArray(referenceImages) && referenceImages.length > 0) {

            for (let i = 0; i < referenceImages.length; i++) {
                const base64 = referenceImages[i];
                if (!base64 || !base64.startsWith('data:image/')) continue;

                const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                const fileName = `image_${Date.now()}_${i + 1}.png`;
                const filePath = path.join(downloadsDir, fileName);

                fs.writeFileSync(filePath, buffer);
                imagePaths.push(filePath);
                console.log(`📸 Lưu ảnh ${i + 1}: ${filePath} (${(buffer.length / 1024).toFixed(1)} KB)`);

            }
        }
        // 🚀 Gọi xử lý video
        const result = await videoGenerate.whisk({
            prompt,
            aspectRatio,
            imagePaths,
        });

        await videoGenerate.deleteFile(imagePaths)
        if(result.success){
             res.status(200).json({
            success: true,
            image: result.image, // ví dụ: "data:image/png;base64,...."
        });
        }else{
             res.status(500).json({ error: 'Lỗi xử lý ảnh hãy thử lại hoặc liên hệ admin để được hỗ trợ' });
        }
       
    } catch (err) {
        videoGenerate.deleteFile(imagePaths)
        console.error("❌ Lỗi xử lý /generate_image:", err);
        res.status(500).json({ error: 'Lỗi xử lý ảnh hoặc tạo video' });
    }
});



export default router;