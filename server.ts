import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Proxy endpoint for Google Sheets CSV fetching (prevents CORS issues in browser)
  app.post('/api/google-sheet-proxy', async (req, res) => {
    try {
      const { sheetUrl } = req.body;
      if (!sheetUrl) {
        return res.status(400).json({ error: 'Thiếu đường dẫn sheetUrl' });
      }

      const response = await fetch(sheetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Application/1.0'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Google Sheet phản hồi lỗi HTTP ${response.status}. Kiểm tra liên kết đã được công khai chưa.`
        });
      }

      const csvText = await response.text();
      res.json({ csvText });
    } catch (err: any) {
      console.error('Google Sheet Proxy Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi kết nối tới Google Sheet' });
    }
  });

  // Append new document to Google Sheet via Google Apps Script Web App URL
  app.post('/api/google-sheet-append', async (req, res) => {
    try {
      const { scriptUrl, doc } = req.body;
      if (!scriptUrl) {
        return res.status(400).json({ error: 'Chưa cấu hình Google Apps Script Web App URL' });
      }

      const payload = {
        id: String(doc?.id || ''),
        category: String(doc?.category || ''),
        name: String(doc?.name || ''),
        content: String(doc?.content || '')
      };

      const tryFetch = async (options: RequestInit, label: string) => {
        const result = { ok: false, status: 0, text: '', error: '' } as const;
        try {
          const response = await fetch(scriptUrl, {
            method: 'POST',
            redirect: 'follow',
            ...options
          });

          result.status = response.status;
          result.text = await response.text();
          result.ok = response.ok;
        } catch (fetchErr: any) {
          result.error = fetchErr.message || String(fetchErr);
        }
        return result;
      };

      const jsonResult = await tryFetch({
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      }, 'json');

      if (jsonResult.ok && !jsonResult.text.includes('<!DOCTYPE html') && !jsonResult.text.includes('<html')) {
        return res.json({ success: true, result: jsonResult.text });
      }

      const formResult = await tryFetch({
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json'
        },
        body: new URLSearchParams(payload).toString()
      }, 'urlencoded');

      if (formResult.ok && !formResult.text.includes('<!DOCTYPE html') && !formResult.text.includes('<html')) {
        return res.json({ success: true, result: formResult.text });
      }

      const queryUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}${new URLSearchParams(payload).toString()}`;
      const getResponse = await fetch(queryUrl, { method: 'GET', redirect: 'follow', headers: { Accept: 'application/json' } });
      const getText = await getResponse.text();

      if (getResponse.ok && !getText.includes('<!DOCTYPE html') && !getText.includes('<html')) {
        return res.json({ success: true, result: getText });
      }

      console.error('Google Sheet Append failed', {
        scriptUrl,
        jsonResult,
        formResult,
        getStatus: getResponse.status,
        getText
      });

      return res.status(502).json({
        error: 'Không thể ghi dữ liệu vào Google Sheet qua Google Apps Script.',
        details: {
          jsonResult,
          formResult,
          getStatus: getResponse.status,
          getText
        }
      });
    } catch (err: any) {
      console.error('Google Sheet Append Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi khi ghi dữ liệu vào Google Sheet' });
    }
  });

  // Gemini AI Accountant Helper endpoint
  app.post('/api/ai/explain', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: 'Chưa cấu hình GEMINI_API_KEY. Vui lòng thêm API Key trong mục Secrets của AI Studio.'
        });
      }

      const { docName, articleTitle, articleContent, userQuestion } = req.body;

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Bạn là một Chuyên gia Kế toán và Thuế cao cấp tại Việt Nam. 
Hãy trợ giúp Kế toán viên giải đáp câu hỏi hoặc giải thích chi tiết quy định pháp luật dựa trên văn bản dưới đây:

Văn bản pháp luật: ${docName || 'Văn bản Kế toán'}
Chương/Điều: ${articleTitle || 'Nội dung quy định'}
Nội dung chi tiết của Điều/Khoản:
"""
${articleContent || ''}
"""

Yêu cầu/Câu hỏi của Kế toán viên:
"${userQuestion || 'Hãy giải thích tóm tắt ý chính của Điều này, cách hạch toán kế toán thực tế và lưu ý quan trọng về thuế.'}"

Hướng dẫn trả lời:
1. Trả lời bằng tiếng Việt rõ ràng, mạch lạc, chính xác về chuyên môn kế toán/thuế Việt Nam.
2. Nêu rõ: 
   - **Tóm tắt ý chính quy định**: Giải thích bằng từ ngữ thực tế dễ hiểu.
   - **Hướng dẫn hạch toán / Thực hiện thực tế**: Bút toán kế toán nợ/có (nếu có) hoặc thủ tục chứng từ hóa đơn cần chuẩn bị.
   - **Lưu ý rủi ro Thuế / Vi phạm**: Những rủi ro cần tránh đối với doanh nghiệp.
3. Trình bày dạng Markdown với các tiêu đề rõ ràng.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const explanation = response.text || 'Không nhận được câu trả lời từ AI.';
      res.json({ explanation });
    } catch (err: any) {
      console.error('Gemini AI Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi khi gọi Gemini AI API' });
    }
  });

  // Vite middleware for dev or static file serving for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Accounting App running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
