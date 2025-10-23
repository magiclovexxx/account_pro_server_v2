import axios from "axios";
import ytdl from '@distube/ytdl-core';
import pkg from '@mrnima/facebook-downloader';
const { facebook } = pkg;
import qs from "qs"; // Dùng nếu cần gửi form-urlencoded
import { GoogleGenAI } from "@google/genai";

import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_KEY,
});

export async function getYoutubeTranscript(youtubeUrl) {
 const url = "https://youtubetotranscript.com/transcript";
  console.log("---> Lấy transcript video");
  try {
   const headers = {
    "accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "max-age=0",
    "content-type": "application/x-www-form-urlencoded",
    "origin": "https://youtubetotranscript.com",
    "priority": "u=0, i",
    "referer": "https://youtubetotranscript.com/",
    "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "cookie":
      "CookieConsent={stamp:'-1',necessary:true,preferences:true,statistics:true,marketing:true,method:'implied',ver:1,utc:1758361188796,iab2:'',region:'VN'}; _ga=GA1.1.620658054.1758361189; exit=\"1\"; __gads=ID=c64210b8a8777e67:T=1760627216:RT=1760629237:S=ALNI_Ma7TQBP4X8d5Dt5y2i2PyJn3eTung; __gpi=UID=000011a4e4881eec:T=1760627216:RT=1760629237:S=ALNI_MaG4_NYTP3vfW93ufLl7fqr94MxcA; __eoi=ID=2faf7a240f69d776:T=1760627216:RT=1760629237:S=AA-AfjYo9WEeGvq37H8qq-CuN7D9; _ga_B191Z2WJ5Q=GS2.1.s1760629232$o3$g1$t1760629434$j47$l0$h0",
  };

  const data = qs.stringify({
    youtube_url: youtubeUrl,
  });

  try {
    const res = await axios.post(url, data, { headers });
    const dataTranscript = res.data

    console.log("lấy transcript qua AI")
    const resp = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            parts: [
              { text: `Lấy nội dung transcript ở bên dưới sau đó viết lại bản transcript hoàn chỉnh đã bỏ phần thừa đi. giữ lại tiêu đề và Viết y hệt nội dung gốc, chỉ bỏ các phần thừa của json. Yêu cầu viết thành các đoạn, có xuống dòng chia phân đoạn, không markdown ${dataTranscript}` }
            ]
          }
        ],
    });
  

    return resp.text;
  } catch (err) {
    console.error("❌ Request failed:", err);
  }
    
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}



export async function getVideoDownloadUrl(url) {
  if (!url) {
    throw new Error('Vui lòng cung cấp URL video');
  }

  try {
    // Kiểm tra nếu là URL YouTube
    if (ytdl.validateURL(url)) {
      try {
        // Sử dụng agent để cải thiện khả năng parse và tránh lỗi
        const agent = ytdl.createAgent();
        const info = await ytdl.getInfo(url, { 
          requestOptions: { 
            timeout: 10000, // Timeout 10s
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          },
          agent
        });

        // Chọn định dạng video có audio và chất lượng cao nhất
        const format = ytdl.chooseFormat(info.formats, { 
          quality: 'highestvideo', 
          filter: 'videoandaudio' 
        });

        if (format && format.url) {
          return format.url;
        }
        throw new Error('Không tìm thấy link tải chất lượng cao cho video YouTube');
      } catch (innerError) {
        // Kiểm tra nếu là livestream
        if (innerError.message.includes('live')) {
          throw new Error('Video YouTube là livestream, không hỗ trợ tải trực tiếp');
        }
        throw new Error(`Lỗi xử lý YouTube: ${innerError.message}`);
      }
    }

    // Kiểm tra nếu là URL Facebook
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
      const result = await facebook(url);
      if (result.status && result.result && result.result.links) {
        const downloadLink = result.result.links.HD || result.result.links.SD || result.result.links.hd || result.result.links.sd;
        if (downloadLink) {
          return downloadLink;
        }
      }
      throw new Error('Không tìm thấy link tải cho video Facebook (có thể video private hoặc lỗi fetch)');
    }

    throw new Error('URL không được hỗ trợ');
  } catch (error) {
    throw new Error(`Lỗi khi xử lý URL video: ${error.message}`);
  }
}

// export async function getVideoDownloadUrl(url) {
//   if (!url) {
//     throw new Error('Vui lòng cung cấp URL video');
//   }

//   try {
//     // Kiểm tra nếu là URL YouTube
//     if (ytdl.validateURL(url)) {
//       const info = await ytdl.getInfo(url);
//       const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
//       if (format && format.url) {
//         return format.url;
//       }
//       throw new Error('Không tìm thấy link tải cho video YouTube');
//     }

//     // Kiểm tra nếu là URL Facebook
//     if (url.includes('facebook.com') || url.includes('fb.watch')) {
//       const result = await fbDownloader(url);
//       if (result && result.hd) {
//         return result.hd;
//       } else if (result && result.sd) {
//         return result.sd;
//       }
//       throw new Error('Không tìm thấy link tải cho video Facebook');
//     }
    
//     // Kiểm tra nếu là URL Facebook
//     if (url.includes('tiktok.com') ) {
//        const { data } = await axios.get(`https://tikwm.com/api?url=${url}`);
//       if (data?.data.play) {
//         return data?.data.play;
//       } 
//       throw new Error('Không tìm thấy link tải cho video Facebook');
//     }

//     throw new Error('URL không được hỗ trợ');
//   } catch (error) {
//     throw new Error(`Lỗi khi xử lý URL video: ${error}`);
//   }
// }


// export const downloadVideo = {
//     async tiktok(videoUrl) {
//         const { data } = await axios.get(`https://tikwm.com/api?url=${videoUrl}`);
//         return data?.data.play;
//     }, 
//      async youtube(videoUrl) {
//          const info = await ytdl.getInfo(url);
//       const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
//       if (format && format.url) {
//         return format.url;
//       } else {
//         return ""
//       }
//        ;
//     }, 
//     async facebook(videoUrl) {
//         const { data } = await axios.get(`https://tikwm.com/api?url=${videoUrl}`);
//         return data;
//     }
// }