import { chromium } from 'playwright-extra';
// import stealth from 'puppeteer-extra-plugin-stealth';

// chromium.use(stealth);
import path from "path";
import fs from "fs";

import https from "https";
import dotenv from "dotenv";
import prisma from "../prisma.js";
dotenv.config();
const headless = process.env.HEADLESS === "true";
const download = process.env.DOWNLOAD === "true";

import { fileURLToPath } from 'url';

// Tạo lại __filename và __dirname tương tự CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getToolAccount(toolType) {
    try {
        const tool = await prisma.tool.findFirst({
            where: { type: toolType, status: true }
        });
        if (!tool) return null;
        return {
            value: tool.cookie || '[]',
            note: tool.desc || tool.name,
            ...tool
        };
    } catch (e) {
        console.error("Error fetching tool account from Prisma:", e.message);
        return null;
    }
}

function normalizeCookies(cookies) {
    return cookies.map((c) => {
        let sameSite = c.sameSite;

        // Chuẩn hóa sameSite theo chuẩn Playwright
        if (!sameSite || sameSite === "unspecified") {
            sameSite = "Lax"; // mặc định về Lax
        } else if (sameSite === "no_restriction") {
            sameSite = "None";
        } else {
            // chuyển lowercase -> capitalized
            sameSite =
                sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase();
        }

        return {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || "/",
            httpOnly: !!c.httpOnly,
            secure: !!c.secure,
            sameSite,
            expires: c.expirationDate ? Math.floor(c.expirationDate) : undefined,
        };
    });
}

// Hàm tải file về
async function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https
            .get(url, (response) => {
                response.pipe(file);
                file.on("finish", () => {
                    file.close(resolve);
                });
            })
            .on("error", (err) => {
                fs.unlink(filepath, () => reject(err));
            });
    });
}

async function downloadVideo(page, data, download1) {
    try {
        // 1. Chờ ít nhất 1 thẻ <video> xuất hiện
        await page.waitForSelector("video", { state: "visible", timeout: 600000 });

        let lastCount = 0;
        let stableCount = 0;
        let count = 0;

        // Lặp đến khi số video không thay đổi trong 5 lần check liên tiếp hoặc đạt 4 video
        while (stableCount <= 30) {
            count = await page.$$eval(
                "video[src]",
                (videos) =>
                    videos.filter((v) => v.src && v.src.startsWith("http")).length
            );

            if (count >= 4 || stableCount == 30) {
                console.log("Dừng vòng while");
                break; // Thoát vòng lặp
            }
            console.log(`⏳ Đang chờ video load... hiện có ${count}`);
            await page.waitForTimeout(5000);

            stableCount++;
        }

        // Lấy toàn bộ link cuối cùng
        const videoUrls = await page.$$eval("video", (videos) =>
            videos.map((v) => v.src).filter((src) => src && src.startsWith("http"))
        );

        console.log(
            `🔎 Tổng cộng tìm thấy ${videoUrls.length} video URLs:`,
            videoUrls
        );

        if (videoUrls.length === 0) {
            throw new Error("Không tìm thấy video nào có src hợp lệ");
        }
        if (download1) {
            // 3. Tạo thư mục download (nếu chưa có)
            const downloadDir = path.join(process.cwd(), "download");
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir);
            }

            // Hàm tạo timestamp DDMMyyyy_hh_mm_ss
            function getTimestamp() {
                const d = new Date();
                const pad = (n) => (n < 10 ? "0" + n : n);
                return (
                    pad(d.getDate()) +
                    pad(d.getMonth() + 1) +
                    d.getFullYear() +
                    "_" +
                    pad(d.getHours()) +
                    "_" +
                    pad(d.getMinutes()) +
                    "_" +
                    pad(d.getSeconds())
                );
            }

            // 4. Tải từng video
            const downloadedFiles = [];

            for (let i = 0; i < videoUrls.length; i++) {
                const videoUrl = videoUrls[i];
                const timestamp = getTimestamp();
                const fileName = `${data.sceneTitle}_video_${i + 1}_${timestamp}.mp4`;
                const filePath = path.join(downloadDir, fileName);

                try {
                    console.log(`⬇️ Đang tải: ${videoUrl}`);
                    const response = await new Promise((resolve, reject) => {
                        https
                            .get(videoUrl, (res) => {
                                if (res.statusCode !== 200) {
                                    reject(new Error(`HTTP Status ${res.statusCode}`));
                                }
                                const file = fs.createWriteStream(filePath);
                                res.pipe(file);
                                file.on("finish", () => {
                                    file.close(() => resolve(filePath));
                                });
                            })
                            .on("error", reject);
                    });

                    console.log(`✅ Đã tải xong: ${filePath}`);
                    downloadedFiles.push(response);
                } catch (err) {
                    console.error(`❌ Lỗi khi tải ${videoUrl}:`, err.message);
                }
            }
        }

        return videoUrls ? videoUrls : [];
    } catch (error) {
        console.log(error);
        return [];
    }
}

export const videoGenerate = {
    async veo3(data) {
        try {
            // console.log('Dữ liệu nhận được:', JSON.stringify(data, null, 2));
            // console.log('data generate:', data);
            // Validate required fields
            if (!data.promptJson) {
                console.log("Lỗi thiếu prompt");
                return {
                    success: false,
                    message: "Thiếu prompt generate video",
                    videoUrls: [],
                };
            }

            // Khởi động Playwright với Chromium
            const browser = await chromium.launch({
                headless: headless, // Set true để chạy ngầm, false để xem trình duyệt
                viewport: null, // Sử dụng kích thước màn hình đầy đủ
                args: [
                    "--disable-blink-features=AutomationControlled",
                    "--enable-blink-features=Clipboard",
                    "--unsafely-treat-insecure-origin-as-secure=https://video.kingoftool.net",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--enable-features=Clipboard",
                ],
            });
            const context = await browser.newContext();
            let cookie1 = JSON.parse(data.toolAccount.value);
            // console.log("cookie1: ", cookie1)
            cookie1 = normalizeCookies(cookie1);
            await context.addCookies(cookie1);
            const page = await context.newPage();

            // Mở URL
            console.log("Đang mở trang https://labs.google/fx/vi/tools/flow...");
            await page.goto("https://labs.google/fx/vi/tools/flow", {
                waitUntil: "networkidle", // Đợi trang load
            });

            try {
                await page.waitForSelector('button:has-text("Dự án mới")', {
                    state: "visible",
                    timeout: 15000, // 15 giây, có thể chỉnh
                });
            } catch (error) {
                const googleBtn = await page.$(
                    'button:has(span:text("Sign in with Google"))'
                );

                if (googleBtn) {
                    console.log("Cookie đã bị logout");
                    browser.close();
                    return { error: "Cookie đã bị logout " };
                }
            }

            let check = await page.$('button:has-text("Dự án mới")');

            await page.click('button:has-text("Dự án mới")');
            // Chờ chuyển trang và nút mới xuất hiện
            await page.waitForSelector('button:has-text("Từ văn bản sang video")', {
                state: "visible",
                timeout: 15000, // 15 giây, có thể chỉnh
            });

            // Cài đặt
            await page.waitForSelector('button:has(i:has-text("tune"))', {
                state: "visible",
            });
            await page.click('button:has(i:has-text("tune"))');
            await page.waitForTimeout(1000);
            // Click đúng combobox có text "Câu trả lời đầu ra cho mỗi câu lệnh"
            await page
                .locator(
                    'button[role="combobox"]:has-text("Câu trả lời đầu ra cho mỗi câu lệnh")'
                )
                .click();

            // Chờ menu mở ra và chọn option có text = "4"
            await page.locator('[role="option"]:has-text("4")').click();

            // Chọn khung hình //
            if (data.aspectRatio == "9:16") {
                await page.click('button:has-text("Tỷ lệ khung hình")');

                // 2. Chờ dropdown mở ra và click vào option "Khổ dọc (9:16)"
                await page.waitForSelector('div:has-text("Khổ dọc (9:16)")', {
                    state: "visible",
                });
                await page.waitForTimeout(1000);
                // await page.click('div:has-text("Khổ dọc (9:16)")');
                // await page.click('text=Khổ dọc (9:16)');
                await page
                    .locator('[role="option"]:has-text("Khổ dọc (9:16)")')
                    .click();
            }

            if (data.aspectRatio == "16:9") {
                await page.click('button:has-text("Tỷ lệ khung hình")');

                // 2. Chờ dropdown mở ra và click vào option "Khổ dọc (9:16)"
                await page.waitForSelector('div:has-text("Khổ ngang (16:9)")', {
                    state: "visible",
                });
                await page.waitForTimeout(1000);
                // await page.click('div:has-text("Khổ dọc (9:16)")');
                // await page.click('text=Khổ ngang (16:9)');
                await page
                    .locator('[role="option"]:has-text("Khổ ngang (16:9)")')
                    .click();
            }

            // nếu có kèm ảnh thì chuyển chế độ
            if (data.imageUrl) {
                // Click tiếp nút "Từ văn bản sang video"
                await page.click('button:has-text("Từ văn bản sang video")');
                // B3: Chờ text "Tạo video từ các khung hình" hiển thị rồi click
                await page.waitForSelector("text=Tạo video từ các khung hình", {
                    state: "visible",
                });
                await page.click("text=Tạo video từ các khung hình");

                // 1. Tải ảnh về
                const downloadPath = path.join(__dirname, "");
                await downloadFile(data.imageUrl, downloadPath);
                console.log("Ảnh đã tải về:", downloadPath);
                await page.waitForTimeout(2000);
                // 2. Click nút đầu tiên có text "add"
                await page.click('button:has(i:has-text("add"))');
                await page.waitForTimeout(1000);
                // 3. Click nút "Tải lên"
                // await page.click('button:has-text("Tải lên")');

                // 4. Upload file vừa tải
                // giả sử có <input type="file">
                const fileInput = await page.waitForSelector('input[type="file"]', {
                    state: "attached",
                });
                await fileInput.setInputFiles(downloadPath);
                await page.waitForTimeout(3000);
                await page.click('button:has-text("Cắt và lưu")');
                await page.waitForTimeout(5000);

                await page.waitForSelector(
                    'div.sc-fbea20b2-13.gFhJTH >> i.google-symbols:has-text("progress_activity")',
                    { state: "detached", timeout: 60000 } // timeout 60s để tránh chờ vô hạn
                );
            }

            // const textData = JSON.parse(data.promptJson);
            const textData = data.promptJson;

            // 4. Paste text vào (cách 1: simulate typing, an toàn nhất)
            // await page.evaluate(async (value) => {
            //     await navigator.clipboard.writeText(value);
            // }, textData);

            console.log("----> Paster Prompt");
            await page.evaluate(async (value) => {
                const text = value;
                const textarea = document.createElement("textarea");
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }, textData);

            // cách 1: dùng fill()
            await page.waitForSelector("#PINHOLE_TEXT_AREA_ELEMENT_ID", {
                state: "visible",
            });
            await page.click("#PINHOLE_TEXT_AREA_ELEMENT_ID");

            // 5. Paste bằng Ctrl+V (hoặc Meta+V cho Mac)
            if (process.platform === "darwin") {
                // MacOS
                await page.keyboard.press("Meta+V");
            } else {
                // Windows / Linux
                await page.keyboard.press("Control+V");
            }
            await page.waitForTimeout(2000);
            await page.waitForSelector('button:has(i:has-text("arrow_forward"))', {
                state: "visible",
            });
            await page.click('button:has(i:has-text("arrow_forward"))');

            // 1. Hover vào nút "Thêm vào cảnh"
            console.log("----> Chờ tạo video");

            let videoUrls = await downloadVideo(page, data, download);
            console.log("----> Tổng số videoUrl: ", videoUrls.length);
            // Đợi 30 giây
            await page.waitForTimeout(3000);

            await browser.close();

            return {
                success: true,
                message: "Tạo video thành công.",
                videoUrls: videoUrls,
            };
        } catch (error) {
            console.error("Lỗi:", error);
            return {
                success: false,
                message: error.message,
                videoUrls: [],
            };
        }
    },
    async nanoBanana(data) {
        try {
            console.log("🟡 Nhận yêu cầu generate image:", data);
            const toolAccount = await getToolAccount("aistudio");

            const maxRetry = 3;
            let retry = 0;
            console.log("toolAccount: ", toolAccount.note)
            retryGenerate:
            while (retry < maxRetry) {
                console.log(`\n🚀 Bắt đầu lần thử ${retry + 1}/${maxRetry}`);
                try {

                } catch (error) {

                }


                try {
                    const { browser, page } = await ensureLogin(toolAccount);
                    console.log("🌐 Mở trang AI Studio...");
                    await page.goto("https://aistudio.google.com/prompts/new_chat", { waitUntil: "networkidle" });

                    const needsLogin = await page
                        .locator('input[type="email"], button:has-text("Sign in")')
                        .isVisible()
                        .catch(() => false);

                    let cookie1 = JSON.parse(toolAccount.value);
                    cookie1 = normalizeCookies(cookie1);
                    if (needsLogin && cookie1?.length) {
                        console.log("🔑 Đang login bằng cookie từ data...");
                        await browser.addCookies(cookie1);
                        await page.goto("https://aistudio.google.com/prompts/new_chat", { waitUntil: "networkidle" });
                        await page.waitForTimeout(3000)
                    }

                    if (process.env.LOGIN == 1) {
                        console.log("🔑 Đang login bằng cơm ..");

                        await page.goto("https://aistudio.google.com/", { waitUntil: "networkidle" });
                        await page.waitForTimeout(300000)
                    }

                    await page.waitForSelector("ms-chunk-input textarea.textarea", { timeout: 20000 });

                    await page.waitForSelector('button[aria-label="Run"]', { timeout: 15000 });


                    // ===== Hàm đóng popup ngẫu nhiên =====


                    // Theo dõi popup nền (20s đầu)
                    let monitoring = true;
                    // (async () => {
                    //     const start = Date.now();
                    //     while (monitoring && Date.now() - start < 5000) {
                    //         await closePopups();
                    //         await page.waitForTimeout(500);
                    //     }
                    // })();

                    // đóng popup warm-welcome nếu có
                    const dialog = page.locator("mat-dialog-container#warm-welcome-dialog-test-id");
                    if (await dialog.isVisible().catch(() => false)) {
                        console.log("🧩 Đóng popup warm-welcome...");
                        await page.click('button[mat-dialog-close][iconname="close"]').catch(() => { });
                        await page.waitForTimeout(1000);
                    }
                    await closePopup(page);

                    // chọn aspect ratio
                    await page.click('mat-select[aria-label="Aspect ratio"]').catch(() => { });
                    await page.waitForSelector('div[role="listbox"] mat-option', { timeout: 5000 }).catch(() => { });
                    await page.click(`div[role="listbox"] mat-option:has-text("${data.aspectRatio}")`).catch(() => { });
                    console.log(`🖼️ Aspect ratio: ${data.aspectRatio}`);

                    // ====== UPLOAD ẢNH AN TOÀN ======
                    if (data.imagePaths?.length > 0) {
                        console.log("📤 Upload ảnh...");
                        await page.click('div.button-wrapper button[iconname="add_circle"]').catch(() => { });
                        await page.waitForTimeout(1000);

                        const absolutePaths = data.imagePaths.map((p) => path.resolve(p));
                        const fileInputs = await page.$$('input[type="file"]');

                        let uploaded = false;
                        for (const input of fileInputs) {
                            try {
                                await input.setInputFiles(absolutePaths);
                                uploaded = true;
                                console.log("✅ Upload ảnh thành công");
                                break;
                            } catch {
                                console.warn("⚠️ Input upload lỗi, thử input khác...");
                            }
                        }
                        await closePopup(page);
                        // await page.waitForTimeout(30000000);
                        if (!uploaded) console.warn("⚠️ Không upload được ảnh nào!");

                    }
                    // await closePopups();
                    // nhập prompt
                    console.log("📝 Dán prompt...");
                    const textarea = await page.waitForSelector("ms-chunk-input textarea.textarea", { timeout: 10000 });
                    await textarea.fill(data.prompt);
                    console.log("✅ Prompt đã nhập xong.");

                    // click nút Run an toàn
                    // await closePopups();
                    console.log("▶️ Chuẩn bị click nút Run...");
                    // const runButton = page.locator('button[aria-label="Run"]');
                    // Gửi Ctrl+Enter thật trong DOM
                    await page.evaluate(() => {
                        const textarea = document.querySelector("ms-chunk-input textarea.textarea");
                        if (textarea) {
                            textarea.focus();
                            const event = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", ctrlKey: true, bubbles: true });
                            textarea.dispatchEvent(event);
                        }
                    });

                    // monitoring = false; // dừng theo dõi popup nền
                    console.log("✅ Đã click nút Run, đang chờ gen ảnh...");

                    // chờ gen ảnh
                    const started = await Promise.race([
                        page.waitForSelector('button.run-button.stoppable', { timeout: 20000 }),
                        page.waitForSelector('text=Stop', { timeout: 20000 }),
                        page.waitForSelector('ms-image-chunk img', { timeout: 20000 }),
                    ]).then(() => true).catch(() => false);

                    if (!started) throw new Error("Google không bắt đầu gen ảnh");

                    console.log("⌛ Đang chờ ảnh sinh ra...");
                    await waitForImageGeneration(page, {
                        runButtonSelector: 'button[aria-label="Run"]',
                        resultSelector: 'ms-image-chunk img',
                        maxWaitMs: 180000,
                        debug: true,
                    });
                    await page.waitForTimeout(3000)
                    await page.screenshot({ path: 'run_button_visible.png', fullPage: true });
                    console.log("✅ Ảnh đã được tạo xong!");
                    const errorElement = await page.$('div:has-text("An internal error has occurred")')
                    if (errorElement) {
                        throw new Error("Quá giới hạn tạo ảnh!");
                    }
                    await page.waitForSelector('ms-image-chunk img[src^="data:image/png;base64"]', { timeout: 60000 });

                    const imageBase64 = await page.evaluate(() => {
                        const imgs = document.querySelectorAll('ms-image-chunk img[src^="data:image/png;base64"]');
                        return imgs.length ? imgs[imgs.length - 1].getAttribute("src") : null;
                    });

                    if (!imageBase64) {
                        throw new Error("Không lấy được ảnh base64!");
                    } else {
                        fs.unlink('run_button_visible.png', (err) => {
                            if (err && err.code !== 'ENOENT') {
                                console.error(`Lỗi xoá run_button_visible`, err);
                            } else {
                                console.log(`Đã xoá: run_button_visible`);
                            }
                        });
                    }

                    const downloadDir = path.join(process.cwd(), "downloads");
                    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

                    const fileName = `image_${Date.now()}.png`;
                    const filePath = path.join(downloadDir, fileName);
                    // fs.writeFileSync(filePath, imageBase64.replace(/^data:image\/png;base64,/, ""), "base64");

                    // console.log(`💾 Đã lưu ảnh vào: ${filePath}`);
                    console.log("📌 Prompt ID:", page.url().split("/").pop());

                    await browser.close();
                    return { success: true, image: imageBase64, path: filePath };

                } catch (err) {
                    retry++;
                    console.error(`⚠️ Lỗi lần ${retry}: ${err.message}`);
                    await browser.close().catch(() => { });

                    if (retry < maxRetry) {
                        console.log("🔁 Reload & thử lại sau 3s...");
                        await new Promise((r) => setTimeout(r, 3000));
                        continue retryGenerate;
                    } else {
                        console.error("❌ Quá 3 lần thử, dừng hẳn.");
                        return { success: false, message: err.message };
                    }
                }
            }
        } catch (error) {
            console.error("💥 Lỗi tổng:", error);
            return { success: false, message: error.message, image: "" };
        }
    },
    async whisk(data) {
        try {
            console.log("🟡 Nhận yêu cầu generate image:", data);

            const maxRetry = 3;
            let retry = 0;

            retryGenerate:
            while (retry < maxRetry) {
                console.log(`\n🚀 Bắt đầu lần thử ${retry + 1}/${maxRetry}`);
                const toolAccount = await getToolAccount("veo3");
                if(!toolAccount){
                    console.log("Không có tool veo3")
                     return { success: false, message: "Có lỗi xảy ra, vui lòng liên hệ admin" };
                }
                const { browser, page, context } = await ensureLogin(toolAccount);
                try {

                    console.log("🌐 Mở trang LAB WHISK ...");
                    await page.goto("https://labs.google/fx/vi/tools/whisk/project", { waitUntil: "networkidle" });

                    let needsLogin = await page
                        .locator('input[type="email"], button:has-text("Sign in")')
                        .isVisible()
                        .catch(() => false);

                    let cookie1 = JSON.parse(toolAccount.value);
                    cookie1 = normalizeCookies(cookie1);

                    if (needsLogin && cookie1?.length) {
                        console.log("🔑 Đang login bằng cookie từ data...");
                        await context.addCookies(cookie1);
                        await page.goto("https://labs.google/fx/vi/tools/whisk/project", { waitUntil: "networkidle" });
                        await page.waitForTimeout(3000);

                        needsLogin = await page
                            .locator('input[type="email"], button:has-text("Sign in")')
                            .isVisible()
                            .catch(() => false);

                        let checkLogin = await page.$('button:has-text("Sign in with Google")')

                        if (needsLogin || checkLogin) {
                            throw new Error("Cookie hết hạn!")
                        }
                    }

                    if (process.env.LOGIN == 1) {
                        console.log("🔑 Đang login bằng cơm ..");
                        await page.goto("https://labs.google/fx/vi/tools/whisk/project/", { waitUntil: "networkidle" });
                        await page.waitForTimeout(300000);
                    }

                    // 🟢 Chờ nút gửi có sẵn
                    await closePopup(page);
                    await page.waitForSelector('button[aria-label="Gửi câu lệnh"]', { timeout: 15000 });

                    // 🖼️ Chọn tỷ lệ và upload ảnh
                    const button = await page.$('button:has-text("Thêm hình ảnh")');
                    if (button) {
                        await button.click();
                        console.log('✅ Clicked "Thêm hình ảnh"');
                    }
                    const absolutePaths = data.imagePaths.map((p) => path.resolve(p));
                    const fileInputs = await page.$$('input[type="file"][accept="image/*"]');
                    await fileInputs[0].setInputFiles(absolutePaths);
                    // await page.waitForTimeout(5000);
                    const aspectButton = page.locator('button:has(i:has-text("aspect_ratio"))');
                    if (await aspectButton.count() > 0) {
                        await aspectButton.click();
                        console.log("✅ Đã click nút 'aspect_ratio'");
                    }

                    await page.waitForTimeout(1000);
                    const aspectRatio = data.aspectRatio;
                    const ratioButton = page.locator(`button:has-text("${aspectRatio}")`);
                    if (await ratioButton.count() > 0) {
                        await ratioButton.first().click();
                        console.log(`✅ Đã chọn tỷ lệ ${aspectRatio}`);
                    }

                    // ✍️ Nhập prompt
                    console.log("📝 Dán prompt...");
                    const textarea = await page.waitForSelector("textarea", { timeout: 10000 });
                    await textarea.fill(data.prompt);
                    console.log("✅ Prompt đã nhập xong.");
                    await page.waitForTimeout(1000);

                    try {
                        console.log("⏳ Đang chờ quá trình phân tích hình ảnh hoàn tất...");
                        await page.waitForFunction(() => {
                            const el = [...document.querySelectorAll('div')]
                                .find(div => div.textContent?.toLowerCase().includes('đang phân tích hình ảnh'));
                            return !el; // chỉ return true khi KHÔNG còn element
                        }, { timeout: 60000 }); // tối đa chờ 60s
                        console.log("✅ Quá trình phân tích hình ảnh đã xong.");
                    } catch (err) {
                        console.warn("⚠️ Hết thời gian chờ phân tích hình ảnh (vẫn tiếp tục).");
                    }

                    // 🚀 Click nút Run

                    console.log("▶️ Chuẩn bị click nút submit...");
                    const btn_submit = await page.waitForSelector('button[aria-label="Gửi câu lệnh"]', { timeout: 15000 });

                    let imageBase64 = null;
                    let blobUrl = null;
                    let imageArray = []
                    // 🎯 Bắt request blob CHỈ sau khi click submit
                    const onRequest = async (request) => {
                        const url = request.url();
                        if (url.startsWith("blob:https://labs.google/")) {
                            blobUrl = url;
                            imageArray.push(url)
                            console.log("🟢 Phát hiện request ảnh blob:", blobUrl);
                        }
                    };

                    // Thêm listener nhưng chỉ hoạt động sau click
                    page.on("request", onRequest);

                    // 🖱️ Click thật sự
                    await btn_submit.click();
                    console.log('✅ Đã click "Gửi câu lệnh"');

                    console.log("⏳ Đang chờ request blob...");

                    // 🕒 Chờ blob xuất hiện (tối đa 60s)
                    const start = Date.now();
                    while (!blobUrl && Date.now() - start < 60000) {
                        await new Promise((r) => setTimeout(r, 500));
                    }

                    if (!blobUrl) throw new Error("Không phát hiện request blob!");

                    console.log("📸 Bắt đầu tải blob để lấy base64...");

                    // ⚙️ Dùng fetch trong browser context để tải blob (tránh lỗi cross-domain)
                    imageBase64 = await page.evaluate(async (url) => {
                        const blob = await fetch(url).then(r => r.blob());
                        const buf = await blob.arrayBuffer();
                        const bytes = new Uint8Array(buf);
                        let binary = "";
                        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                        return "data:image/png;base64," + btoa(binary);
                    }, blobUrl);

                    if (!imageBase64) throw new Error("Không lấy được dữ liệu base64 từ blob!");

                    console.log("🎉 Ảnh đã được lấy thành công!");
                    page.off("request", onRequest);
                    await context.storageState({ path: "session.json" });
                    await browser.close();
                    return { success: true, image: imageBase64, imageUrl: imageArray };

                } catch (err) {
                    retry++;
                    console.error(`⚠️ Lỗi lần ${retry}: ${err.message}`);
                    await browser.close().catch(() => { });
                    if (retry < maxRetry) {
                        console.log("🔁 Reload & thử lại sau 3s...");
                        await new Promise((r) => setTimeout(r, 3000));
                        continue retryGenerate;
                    } else {
                        console.error("❌ Quá 3 lần thử, dừng hẳn.");
                        return { success: false, message: err.message };
                    }
                }
            }
        } catch (error) {
            console.error("💥 Lỗi tổng:", error);
            return { success: false, message: error.message, image: "" };
        }
    }

    ,

    async deleteFile(imagePaths) {
        const promises = imagePaths.map(async (imagePath) => {
            try {
                fs.unlink(imagePath, (err) => {
                    if (err && err.code !== 'ENOENT') {
                        console.error(`Lỗi xoá ${imagePath}:`, err);
                    } else {
                        console.log(`Đã xoá: ${imagePath}`);
                    }
                });
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.error(`Lỗi xoá ${imagePath}:`, err);
                }
            }
        });
        await Promise.all(promises);
    }

    ,
};


async function ensureLogin(data) {
    // console.log("Dataaa: ", data)
    const baseProfileDir = path.join(process.cwd(), "profiles");
    const profileDir = `${data.userId}_${data.$id}`;
    const userDataDir = path.join(baseProfileDir, profileDir);
    const lockfile = path.join(userDataDir, "lockfile");

    try {
        // Nếu profile chưa có thì tạo
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

        // Nếu lockfile tồn tại → thử xóa hoặc đổi tên tránh conflict
        if (fs.existsSync(lockfile)) {
            try {
                fs.unlinkSync(lockfile);
                console.log("🧹 Đã gỡ file lock cũ");
            } catch (err) {
                console.warn("⚠️ Lockfile đang bị giữ, đổi tên tránh xung đột...");
                fs.renameSync(lockfile, `${lockfile}.bak_${Date.now()}`);
            }
        }

        console.log(`📁 Dùng profile tại: ${userDataDir}`);
        let browser

        browser = await chromium.launch({
            headless: headless,
            args: [
                "--start-maximized",
                "--disable-blink-features=AutomationControlled",
                "--enable-blink-features=Clipboard",
                "--no-sandbox",
                "--disable-infobars",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--hide-scrollbars",
                "--mute-audio",
                "--window-size=1920,1080",
            ],
            viewport: null,
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        });

        const context = await browser.newContext(
            fs.existsSync("session.json")
                ? { storageState: "session.json" }
                : {}
        );

        const page = await context.newPage();

        // const page = browser.pages().length ? browser.pages()[0] : await browser.newPage();

        // ẩn automation
        await context.addInitScript(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => false });
        });

        return { browser, page, context };
    } catch (error) {
        console.error("💥 ensureLogin error:", error);

        // Nếu lỗi EBUSY → xóa toàn bộ profile hỏng
        if (error.code === "EBUSY") {
            console.log("🧨 Hồ sơ bị kẹt — xóa và thử lại...");
            await fs.promises.rm(userDataDir, { recursive: true, force: true });
            return await ensureLogin(data); // retry
        }

        // throw error;
    }
}



// async function ensureLogin(data) {
//     try {
//         const baseProfileDir = path.join(process.cwd(), "profiles");
//         const profileDir = `${data.userId}_${data.$id}`
//         const userDataDir = path.join(baseProfileDir, profileDir);

//         if (!fs.existsSync(userDataDir)) {
//             fs.mkdirSync(userDataDir, { recursive: true });
//         }

//         console.log(`📁 Dùng profile tại: ${userDataDir}`);

//         const browser = await chromium.launchPersistentContext(userDataDir, {
//             headless: headless, // để true nếu muốn chạy ẩn
//             args: [
//                 "--start-maximized",
//                 "--disable-blink-features=AutomationControlled",
//                 "--enable-blink-features=Clipboard",
//                 "--no-sandbox",
//                 "--disable-infobars",
//                 "--disable-setuid-sandbox",
//                 "--disable-dev-shm-usage",
//                 "--hide-scrollbars",
//                 "--mute-audio",
//                 "--window-size=1920,1080",
//                 // '--use-gl=swiftshader',
//             ],
//             viewport: null,
//             userAgent:
//                 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         }).catch(console.error);;
//         // chống detect automation
//         await browser.addInitScript(() => {
//             Object.defineProperty(navigator, "webdriver", { get: () => false });
//             window.navigator.chrome = { runtime: {} };
//             Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
//             Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
//             const originalQuery = window.navigator.permissions.query;
//             window.navigator.permissions.query = (parameters) =>
//                 parameters.name === "notifications"
//                     ? Promise.resolve({ state: Notification.permission })
//                     : originalQuery(parameters);
//         });
//         const page = (await browser.pages())[0];
//         // --- Auto cập nhật lại cookie sau mỗi phiên ---

//         return { browser, page };
//     } catch (error) {
//         console.log(error)
//     }

// }

const closePopup = async (page) => {
    try {
        // popup warm-welcome
        const warmWelcome = page.locator("mat-dialog-container#warm-welcome-dialog-test-id");
        if (await warmWelcome.isVisible().catch(() => false)) {
            console.log("🧩 Đóng popup warm-welcome...");
            await page.click('button[mat-dialog-close][iconname="close"]').catch(() => { });
            await page.waitForTimeout(1000);
        }

        // popup overlay khác (upload, overlay bản quyền)
        const overlaySelector = [
            'div.cdk-overlay-pane',
            'mat-dialog-container',
            'div[role="dialog"]',
            'div[class*="overlay-backdrop"]',
        ].join(',');
        const overlayVisible = await page.locator(overlaySelector).isVisible().catch(() => false);
        if (overlayVisible) {
            console.log("🧩 Phát hiện overlay → thử đóng...");
            await page.keyboard.press('Escape').catch(() => { });
            await page.click('button[mat-dialog-close], button:has-text("Close")').catch(() => { });
            await page.waitForTimeout(800);
        }

        // popup bản quyền có nút Acknowledge
        const ackButton = await page.$('mat-dialog-actions button.ms-button-primary:has-text("Acknowledge")');
        if (ackButton) {
            console.log('⚠️ Phát hiện popup "Acknowledge" — đang xác nhận bản quyền...');
            await ackButton.click({ force: true }).catch(() => { });
            await page.waitForTimeout(1000);
        }

    } catch (err) {
        console.warn("⚠️ closePopup gặp lỗi:", err.message);
    }
};

async function waitForImageGeneration(page, opts = {}) {
    const {
        runButtonSelector = 'button[aria-label="Run"]',
        resultSelector = 'ms-image-chunk img, img.generated, .gempix img', // chỉnh theo thực tế ảnh output
        maxWaitMs = 3 * 60 * 1000,
        pollInterval = 1000,
        debug = true
    } = opts;

    const start = Date.now();
    let hasStarted = false;

    if (debug) console.log('⏳ Bắt đầu chờ ảnh được tạo...');

    while (Date.now() - start < maxWaitMs) {
        const button = await page.$(runButtonSelector);

        if (button) {
            const labelText = await button.textContent();
            const isStop = labelText?.trim().toLowerCase().includes('stop');
            const isRun = labelText?.trim().toLowerCase().includes('run');

            if (debug) console.log('Trạng thái nút:', labelText?.trim());

            if (isStop) {
                hasStarted = true; // Đang gen
            }

            if (hasStarted && isRun) {
                // Sau khi từng thấy Stop và giờ quay về Run → ảnh đã gen xong
                if (debug) console.log('✅ Ảnh đã gen xong (nút quay lại "Run").');
                return true;
            }
        }

        // Nếu ảnh đã xuất hiện thì cũng coi là xong
        // const img = await page.$(resultSelector);
        // if (img) {
        //     if (debug) console.log('🖼️ Ảnh output đã xuất hiện.');
        //     return true;
        // }

        await page.waitForTimeout(pollInterval);
    }

    throw new Error('⏰ Hết thời gian chờ, chưa thấy ảnh được tạo hoặc nút "Run" quay lại.');
}
