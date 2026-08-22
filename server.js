import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './src/routes.js';

// Khởi chạy hệ thống tự động cào báo cáo GAM (Cron jobs)
import './getDataGAM.js';

dotenv.config();

const PORT = process.env.PORT || 6789;
const app = express();

// Middleware
app.use(cors());

// Cho phép nhận body lớn
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API Routes
app.use("/api", router);

// Health check routes
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