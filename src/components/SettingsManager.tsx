import React, { useState } from 'react';
import { AccountingDocument, GoogleSheetSettings } from '../types';
import { fetchGoogleSheetDocuments, extractContent1 } from '../utils/googleSheetSync';
import { 
  FileCode, 
  Upload, 
  Plus, 
  Trash2, 
  RefreshCw, 
  FileSpreadsheet, 
  Check, 
  AlertCircle, 
  ExternalLink,
  FileText,
  Sparkles,
  Save
} from 'lucide-react';

interface SettingsManagerProps {
  documents: AccountingDocument[];
  onSaveDocument: (doc: AccountingDocument) => void;
  onDeleteDocument: (docId: string) => void;
  onImportDocuments: (docs: AccountingDocument[], overwrite: boolean) => void;
  onResetToDefault: () => void;
  sheetSettings: GoogleSheetSettings;
  onUpdateSheetSettings: (settings: GoogleSheetSettings) => void;
  editingDocId?: string;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  documents,
  onSaveDocument,
  onDeleteDocument,
  onImportDocuments,
  onResetToDefault,
  sheetSettings,
  onUpdateSheetSettings,
}) => {
  // Compute next auto-increment numeric ID (1, 2, 3, 4...)
  const getNextAutoId = () => {
    let maxNum = 0;
    documents.forEach((d) => {
      const match = d.id.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    return (maxNum > 0 ? maxNum + 1 : (documents.length > 0 ? documents.length + 1 : 1)).toString();
  };

  // Form states for creating new document
  const [docCode, setDocCode] = useState<string>(''); // Mã văn bản e.g. 252/2025/NĐ-CP
  const [docCategory, setDocCategory] = useState<string>('Nghị định'); // Thể loại
  const [docName, setDocName] = useState<string>(''); // Tên văn bản
  const [uploadedContent, setUploadedContent] = useState<string>(''); // Parsed HTML file content
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1AXvaB4LyBUkCeeI6dxqwXY3YrQYhYlozZeqSmR3u0xY/edit?usp=sharing';

  // Google Sheet URL & Script URL states
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(sheetSettings.sheetUrl || DEFAULT_SHEET_URL);
  const [scriptUrlInput, setScriptUrlInput] = useState<string>(sheetSettings.scriptUrl || '');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showScriptGuide, setShowScriptGuide] = useState<boolean>(false);

  const sanitizeAppsScriptUrl = (inputUrl: string): string | null => {
    const trimmed = inputUrl.trim();
    const match = trimmed.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/);
    return match ? match[0] : null;
  };

  // File Upload Handler (.html, .htm, .txt, .doc)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        // Extract content inside class="content1" if HTML file has it
        const extracted = extractContent1(text);
        setUploadedContent(extracted);
        setUploadedFileName(file.name);

        // Auto-fill name if name is empty
        if (!docName) {
          const cleanName = file.name.replace(/\.[^/.]+$/, '');
          setDocName(cleanName);
        }

        setSuccessMsg(`✓ Đã nạp file "${file.name}" thành công!`);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    };
    reader.readAsText(file);
  };

  // Add Document Submit Handler
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) {
      setErrorMsg('Vui lòng nhập Tên văn bản.');
      return;
    }
    if (!uploadedContent.trim()) {
      setErrorMsg('Vui lòng tải file văn bản (HTML/Text) từ máy tính.');
      return;
    }

    const autoId = getNextAutoId();
    const finalId = docCode.trim() ? docCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_') : autoId;

    const newDoc: AccountingDocument = {
      id: finalId,
      category: docCategory.trim() || 'Nghị định',
      name: docName.trim(),
      content: uploadedContent,
      updatedAt: new Date().toISOString().split('T')[0]
    };

    // Auto save scriptUrl if changed
    if (scriptUrlInput !== sheetSettings.scriptUrl || sheetUrlInput !== sheetSettings.sheetUrl) {
      onUpdateSheetSettings({
        ...sheetSettings,
        sheetUrl: sheetUrlInput.trim(),
        scriptUrl: scriptUrlInput.trim()
      });
    }

    // Save document to local web app state
    onSaveDocument(newDoc);

    // If Google Apps Script URL is set, send POST request to append row to Google Sheet
    if (scriptUrlInput.trim()) {
      const validScriptUrl = sanitizeAppsScriptUrl(scriptUrlInput);
      if (!validScriptUrl) {
        setErrorMsg('URL Apps Script không hợp lệ. Vui lòng chỉ dán đường dẫn /exec duy nhất.');
      } else {
        if (validScriptUrl !== scriptUrlInput.trim()) {
          setScriptUrlInput(validScriptUrl);
        }

        try {
          const res = await fetch('/api/google-sheet-append', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scriptUrl: validScriptUrl,
              doc: {
                id: newDoc.id,
                category: newDoc.category,
                name: newDoc.name,
                content: newDoc.content
              }
            })
          });

          const resData = await res.json().catch(() => ({}));

          if (res.ok && resData.success) {
            setSuccessMsg(`🎉 Đã thêm văn bản [${finalId}] VÀ ĐÃ TỰ ĐỘNG GHI THÊM 1 DÒNG VÀO GOOGLE SHEET!`);
          } else {
            setSuccessMsg(`🎉 Đã thêm văn bản [${finalId}] vào Web.`);
            setErrorMsg(
              resData?.error
                ? `Lỗi Google Sheet: ${resData.error}`
                : 'Không thể ghi vào Google Sheet. Kiểm tra URL Web App và quyền truy cập.'
            );
          }
        } catch (err: any) {
          setSuccessMsg(`🎉 Đã thêm văn bản [${finalId}] vào Web.`);
          setErrorMsg(`Lỗi khi ghi vào Google Sheet: ${err.message || 'Không thể kết nối tới Web App.'}`);
        }
      }
    } else {
      setSuccessMsg(`🎉 Đã thêm văn bản [${finalId}] vào Web! (Hãy dán URL Apps Script ở dưới để tự động chèn vào Google Sheet).`);
    }

    // Reset form fields
    setDocCode('');
    setDocName('');
    setUploadedContent('');
    setUploadedFileName('');

    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // Update Google Sheet URL & Sync
  const handleSaveSheetSettings = async () => {
    if (!sheetUrlInput.trim()) return;
    setIsSyncing(true);
    setErrorMsg(null);

    try {
      const fetchedDocs = await fetchGoogleSheetDocuments(sheetUrlInput);
      onUpdateSheetSettings({
        sheetUrl: sheetUrlInput,
        scriptUrl: scriptUrlInput,
        autoSyncOnLoad: true,
        lastSyncedAt: new Date().toLocaleTimeString('vi-VN')
      });
      if (fetchedDocs && fetchedDocs.length > 0) {
        onImportDocuments(fetchedDocs, true);
        setSuccessMsg(`✓ Đã đồng bộ thành công ${fetchedDocs.length} văn bản từ Google Sheet!`);
      } else {
        setSuccessMsg(`✓ Đã lưu cài đặt Google Sheet!`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể đồng bộ từ Google Sheet. Vui lòng kiểm tra lại đường dẫn.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      
      {/* Page Title Header */}
      

      {/* Global Alerts */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-xl text-emerald-900 text-xs font-bold flex items-center justify-between shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-xl text-rose-900 text-xs font-bold flex items-center justify-between shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Google Sheet URL Box */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div>
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-600" />
            <span>Kết Nối Google Sheet</span>
          </h3>
         
        </div>

        {/* 1. Link ĐỌC dữ liệu */}
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
            <span>1. Link ĐỌC Dữ Liệu từ Google Sheet:</span>
            <span className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded">Đồng bộ tự động</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={sheetUrlInput}
              onChange={(e) => setSheetUrlInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/1AXvaB4LyBUkCeeI6dxqwXY3YrQYhYlozZeqSmR3u0xY/edit?usp=sharing"
              className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <button
              type="button"
              onClick={handleSaveSheetSettings}
              disabled={isSyncing}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Link Đọc</span>
            </button>
          </div>
        </div>

        {/* 2. Link GHI dữ liệu */}
        <div className="space-y-1 pt-1">
          <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
            <span>2. Link GHI Dữ Liệu vào Google Sheet (Google Apps Script Web App):</span>
            
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={scriptUrlInput}
              onChange={(e) => setScriptUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
              className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <button
              type="button"
              onClick={handleSaveSheetSettings}
              disabled={isSyncing}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Link Ghi</span>
            </button>
          </div>
        </div>

        {/* Collapsible Guide for Apps Script */}
        {showScriptGuide && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs text-amber-950 animate-fade-in">
            <h4 className="font-bold text-amber-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-700" />
              <span>Hướng Dẫn 3 Bước Tự Động Chèn Hàng Vào Google Sheet:</span>
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-800 font-medium">
              <li>Mở tệp Google Sheet của bạn &gt; chọn menu <strong>Tiện ích mở rộng (Extensions)</strong> &gt; chọn <strong>Apps Script</strong>.</li>
              <li>Dán đoạn mã dưới đây vào và bấm <strong>Lưu (Save)</strong>:</li>
            </ol>
            <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto select-all">
{`function doPost(e) { return handleRequest(e); }
function doGet(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }
    
    var id = data.id || "DOC_" + (sheet.getLastRow() + 1);
    var category = data.category || "Văn bản Kế toán";
    var name = data.name || "Văn bản Mới";
    var content = data.content || "";
    
    sheet.appendRow([id, category, name, content]);
    
    return ContentService.createTextOutput(JSON.stringify({"result": "success"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`}
            </pre>
            <ol start={3} className="list-decimal list-inside space-y-1 text-slate-800 font-medium">
              <li>Bấm nút <strong>Triển khai (Deploy)</strong> &gt; <strong>Triển khai dưới dạng ứng dụng web (New deployment - Web app)</strong>:
                <ul className="list-disc list-inside pl-5 font-normal text-slate-700 mt-0.5">
                  <li>Người thực thi (Execute as): <strong>Thực thi bằng tài khoản của tôi (Me)</strong></li>
                  <li>Ai có quyền truy cập (Who has access): <strong>Bất kỳ ai (Anyone)</strong></li>
                </ul>
              </li>
              <li>Sao chép đường dẫn Web App (`.../exec`) và dán vào ô <strong>Link GHI Dữ Liệu</strong> ở trên!</li>
            </ol>
          </div>
        )}

        {sheetSettings.lastSyncedAt && (
          <p className="text-[11px] text-slate-400 font-medium">
            Lần đồng bộ đọc gần nhất: <span className="font-semibold text-slate-600">{sheetSettings.lastSyncedAt}</span>
          </p>
        )}
      </div>

      {/* Main Document Creation Form */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b pb-3 border-slate-100">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-red-700" />
            <span>Thêm Văn Bản Mới</span>
          </h3>
          <span className="text-xs bg-slate-100 text-slate-700 font-mono font-bold px-2.5 py-1 rounded-lg border border-slate-200">
            ID tiếp theo: <strong className="text-red-700">{getNextAutoId()}</strong>
          </span>
        </div>

        <form onSubmit={handleAddDocument} className="space-y-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Mã văn bản */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mã Văn Bản:
              </label>
              <input
                type="text"
                value={docCode}
                onChange={(e) => setDocCode(e.target.value)}
                placeholder="Ví dụ: 252/2025/NĐ-CP"
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>

            {/* Thể loại */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Thể Loại Văn Bản:
              </label>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-600 cursor-pointer"
              >
                <option value="Nghị định">Nghị định</option>
                <option value="Thông tư">Thông tư</option>
                <option value="Luật">Luật</option>
                <option value="Quyết định">Quyết định</option>
                <option value="Chuẩn mực Kế toán">Chuẩn mực Kế toán</option>
                <option value="Văn bản hợp nhất">Văn bản hợp nhất</option>
              </select>
            </div>

            {/* Tên văn bản */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tên Văn Bản <span className="text-red-600">*</span>:
              </label>
              <input
                type="text"
                required
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Ví dụ: Nghị định quy định chi tiết về Chế độ kế toán..."
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>

          </div>

          {/* Upload File Section */}
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-bold text-slate-700">
              Tải File Nội Dung Văn Bản (HTML / Text): <span className="text-red-600">*</span>
            </label>

            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 hover:border-red-500 bg-slate-50 hover:bg-red-50/40 rounded-2xl cursor-pointer transition group text-center">
              <Upload className="w-8 h-8 text-slate-400 group-hover:text-red-700 transition mb-2" />
              <span className="text-xs font-bold text-slate-800 group-hover:text-red-900">
                {uploadedFileName ? `✓ ${uploadedFileName}` : 'Bấm để chọn file HTML/Nội dung văn bản từ máy tính'}
              </span>
              <span className="text-[11px] text-slate-400 mt-1">
                {uploadedContent ? `Đã nạp ${uploadedContent.length} ký tự. Hệ thống tự trích xuất khối class="content1"` : 'Hỗ trợ file .html, .htm, .txt'}
              </span>
              <input
                type="file"
                accept=".html,.htm,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Văn Bản Mới</span>
            </button>
          </div>

        </form>
      </div>

      {/* Existing Documents Summary Table */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b pb-3 border-slate-100">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-700" />
            <span>Danh Sách Văn Bản Hiện Có ({documents.length})</span>
          </h3>
          <button
            type="button"
            onClick={() => {
              if (confirm('Bạn có chắc chắn muốn đặt lại danh sách văn bản về mặc định không?')) {
                onResetToDefault();
              }
            }}
            className="text-xs text-slate-500 hover:text-red-700 font-medium underline cursor-pointer"
          >
            Đặt lại mặc định
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3 w-16">ID</th>
                <th className="p-3 w-32">Thể loại</th>
                <th className="p-3">Tên văn bản</th>
                <th className="p-3 w-28 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-mono font-bold text-slate-700">{doc.id}</td>
                  <td className="p-3 font-medium text-slate-600">{doc.category}</td>
                  <td className="p-3 font-semibold text-slate-900">{doc.name}</td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Xóa văn bản [${doc.id}] - ${doc.name}?`)) {
                          onDeleteDocument(doc.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Xóa văn bản"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
