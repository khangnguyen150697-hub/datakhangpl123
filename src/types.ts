export interface AccountingDocument {
  id: string; // Col A: Mã văn bản (ND252, TT200...)
  category: string; // Col B: Thể loại (Nghị định, Thông tư...)
  name: string; // Col C: Tên văn bản
  content: string; // Col D: Nội dung HTML văn bản
  issueDate?: string; // Ngày ban hành
  effectiveDate?: string; // Ngày có hiệu lực
  issuer?: string; // Cơ quan ban hành (Chính phủ, Bộ Tài chính...)
  signer?: string; // Người ký (Thủ tướng, Bộ trưởng...)
  officialUrl?: string; // Link tham khảo gốc (ví dụ thuvienphapluat.vn)
  updatedAt?: string;
  sourceSheetUrl?: string;
}

export interface TocItem {
  id: string;
  type: 'chapter' | 'article' | 'section';
  number: string; // e.g. "Chương I", "Điều 1"
  title: string; // e.g. "Quy định chung", "Phạm vi điều chỉnh"
  elementId: string; // DOM id to scroll to
  rawText: string;
  level: number;
  chapterId?: string; // Parent chapter item id for collapsing
}

export interface GoogleSheetSettings {
  sheetUrl: string;
  scriptUrl?: string; // Google Apps Script Web App URL to append rows to Sheet
  autoSyncOnLoad: boolean;
  lastSyncedAt?: string;
}

