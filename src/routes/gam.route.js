import express from 'express';
import axios from 'axios';
import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const router = express.Router();
const writeFileAsync = promisify(fs.writeFile);

// Hàm lấy refresh_token (giữ nguyên, cổng 6789)
async function getRefreshToken({ clientId, clientSecret, redirectUri }) {
  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const SCOPES = ['https://www.googleapis.com/auth/dfp'];
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        if (parsedUrl.pathname === new URL(redirectUri).pathname) {
          const code = parsedUrl.query.code;
          if (code) {
            try {
              const { tokens } = await oauth2Client.getToken(code);
              res.writeHead(200, { 'Content-Type': 'text/plain' });
              res.end(`Refresh Token: ${tokens.refresh_token}`);
              server.close();
              resolve({
                success: true,
                refreshToken: tokens.refresh_token,
                accessToken: tokens.access_token
              });
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Error retrieving tokens');
              server.close();
              reject(new Error(`Error retrieving tokens: ${error.message}`));
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('No code provided');
            server.close();
            reject(new Error('No code provided'));
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });

      server.listen(6789, () => {
        console.log('Server running on http://localhost:6789');
        console.log('Open this URL in your browser to authenticate:', authUrl);
      });
    });
  } catch (error) {
    console.error('Error in getRefreshToken:', error.message);
    return { success: false, error: error.message };
  }
}

// Hàm lấy report từ Google Ad Manager sử dụng REST API
async function getGAMReport({ networkCode, clientId, clientSecret, refreshToken, reportQuery, outputFile = 'gam_report.csv' }) {
  try {
    // Cấu hình OAuth2
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:6789/oauth2callback');
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauth2Client.getAccessToken();
    if (!token) throw new Error('Failed to obtain access token');

    // Report query mặc định
    const defaultReportQuery = {
      dimensions: ['DATE', 'AD_UNIT_NAME'],
      columns: ['TOTAL_LINE_ITEM_LEVEL_IMPRESSIONS', 'TOTAL_LINE_ITEM_LEVEL_CLICKS'],
      dateRangeType: 'LAST_WEEK',
      adUnitView: 'TOP_LEVEL'
    };

    const finalReportQuery = { ...defaultReportQuery, ...reportQuery };

    // Tạo report job
    console.log('Creating report job for networkCode:', networkCode);
    const apiVersion = 'v202408'; // Cập nhật phiên bản API mới nhất (kiểm tra tài liệu)
    const createReportResponse = await axios.post(
      `https://admanager.googleapis.com/${apiVersion}/networks/${networkCode}/reports`,
      { reportQuery: finalReportQuery },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reportJobId = createReportResponse.data.reportJobId;
    console.log('Report Job ID:', reportJobId);

    // Poll trạng thái report
    console.log('Polling report status...');
    let reportStatus;
    do {
      reportStatus = await axios.get(
        `https://admanager.googleapis.com/${apiVersion}/networks/${networkCode}/reports/${reportJobId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Current status:', reportStatus.data.status);
      await new Promise(resolve => setTimeout(resolve, 5000));
    } while (reportStatus.data.status !== 'COMPLETED' && reportStatus.data.status !== 'FAILED');

    if (reportStatus.data.status !== 'COMPLETED') {
      throw new Error(`Report failed with status: ${reportStatus.data.status}`);
    }

    // Download report
    console.log('Downloading report...');
    const reportData = await axios.get(
      `https://admanager.googleapis.com/${apiVersion}/networks/${networkCode}/reports/${reportJobId}/generate?alt=media`,
      { headers: { Authorization: `Bearer ${token}` }, responseType: 'text' }
    );

    // Lưu file CSV
    const filePath = path.join(process.cwd(), outputFile);
    await writeFileAsync(filePath, reportData.data, 'utf-8');
    console.log(`Report downloaded to: ${filePath}`);

    // Parse CSV để trả về dữ liệu JSON
    const csvData = reportData.data;
    const rows = csvData.split('\n').map(row => row.split(','));
    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });

    return {
      success: true,
      reportJobId,
      status: reportStatus.data.status,
      filePath,
      data
    };
  } catch (error) {
    console.error('Error fetching GAM report:', error.message);
    console.error('Error details:', error.response?.data || error);
    return {
      success: false,
      error: error.message,
      details: error.response?.data
    };
  }
}

// Route GET /report
router.get('/report', async (req, res) => {
  try {
    const { networkCode, clientId, clientSecret, refreshToken } = req.query;
    if (!networkCode || !clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameters: networkCode, clientId, clientSecret, refreshToken'
      });
    }

    console.log('GAM report request for network:', networkCode);

    const reportQuery = {
      dimensions: ['DATE', 'AD_UNIT_NAME'],
      columns: ['TOTAL_LINE_ITEM_LEVEL_IMPRESSIONS', 'TOTAL_LINE_ITEM_LEVEL_CLICKS'],
      dateRangeType: 'LAST_WEEK'
    };

    const result = await getGAMReport({
      networkCode,
      clientId,
      clientSecret,
      refreshToken,
      reportQuery,
      outputFile: `gam_report_${networkCode}.csv`
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error,
        details: result.details
      });
    }

    res.json({
      success: true,
      reportJobId: result.reportJobId,
      status: result.status,
      filePath: result.filePath,
      data: result.data
    });
  } catch (err) {
    console.error('Error in /report route:', err.message);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

export default router;