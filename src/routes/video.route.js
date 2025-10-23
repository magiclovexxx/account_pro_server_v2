import express from 'express';
const router = express.Router();
import { getVideoDownloadUrl, getYoutubeTranscript } from '../services/downloadVideo.js';

router.get('/youtube-transript', async (req, res) => {
    const url = req.query.url
    const transcript = await getYoutubeTranscript(url)
    if (transcript) {
        res.status(200).json({
            success: true,
            transcript: transcript
        });
    } else {
        res.status(200).json({
            success: false,
        });
    }

})
router.get('/download', async (req, res) => {

    const url = req.query.url
    let video = await getVideoDownloadUrl(url)
    console.log("video: ", video)
    res.status(200).json({
        success: true,
        video_url: video
    });

});


export default router;