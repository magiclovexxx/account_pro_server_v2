import { spawn } from 'child_process';
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';

/**
 * Lấy thông tin media (audio/video)
 * @param {string} filePath
 * @returns {Promise<object>}
 */
export async function getMediaInfo(filePath) {
    return new Promise((resolve, reject) => {
        ffprobe(filePath, { path: ffprobeStatic.path }, (err, info) => {
            if (err) return reject(err);
            resolve(info);
        });
    });
}

/**
 * Lấy độ dài video/audio (giây)
 * @param {object} info
 * @returns {number}
 */
function getDuration(info) {
    const duration = parseFloat(info.format?.duration || 0);
    return isNaN(duration) ? 0 : duration;
}

/**
 * Kiểm tra video có chứa audio không
 * @param {object} info
 * @returns {boolean}
 */
function hasAudioTrack(info) {
    return info.streams.some(s => s.codec_type === 'audio');
}

/**
 * Chèn nhạc nền thông minh: tự động lặp, tự giảm volume khi có audio gốc
 * @param {string} inputVideo - đường dẫn video gốc
 * @param {string} inputAudio - đường dẫn nhạc nền
 * @param {string} outputVideo - file đầu ra
 * @param {number} baseMusicVolume - volume nhạc nền cơ bản (0.0–1.0)
 * @param {number} reduceWhenHasAudio - hệ số giảm volume nếu video có audio (vd: 0.3)
 */


export const editVideo = {
    async addBackgroundMusicSmart(
        inputVideo,
        inputAudio,
        outputVideo,
        baseMusicVolume = 1.0,
        reduceWhenHasAudio = 0.3
    ) {
        const videoInfo = await getMediaInfo(inputVideo);
        const audioInfo = await getMediaInfo(inputAudio);

        const videoDuration = getDuration(videoInfo);
        const audioDuration = getDuration(audioInfo);
        const videoHasAudio = hasAudioTrack(videoInfo);

        const loopCount = Math.ceil(videoDuration / audioDuration);
        const volume = videoHasAudio ? baseMusicVolume * reduceWhenHasAudio : baseMusicVolume;

        console.log(`🎬 Video: ${videoDuration.toFixed(2)}s`);
        console.log(`🎵 Audio: ${audioDuration.toFixed(2)}s`);
        console.log(`🔁 Lặp audio ${loopCount} lần`);
        console.log(`🔊 Volume nhạc nền: ${volume}`);

        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-i', inputVideo,
                '-stream_loop', (loopCount - 1).toString(),
                '-i', inputAudio,
                '-filter_complex',
                `[1:a]volume=${volume}[music];` +
                (videoHasAudio
                    ? `[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`
                    : `[music]anull[aout]`
                ),
                '-map', '0:v',
                '-map', '[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                outputVideo
            ];

            const ffmpeg = spawn('ffmpeg', ffmpegArgs);

            ffmpeg.stderr.on('data', d => process.stdout.write(d.toString()));

            ffmpeg.on('close', code => {
                if (code === 0) {
                    console.log(`✅ Xuất video thành công: ${outputVideo}`);
                    resolve(outputVideo);
                } else {
                    reject(new Error(`❌ ffmpeg lỗi, mã code: ${code}`));
                }
            });
        });
    }

}