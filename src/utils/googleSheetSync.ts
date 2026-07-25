import Papa from 'papaparse';
import { AccountingDocument } from '../types';

/**
 * Extracts Google Spreadsheet ID from various Google Sheet URL formats
 */
export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Converts a Google Sheet URL to its public CSV download link
 */
export function getGoogleSheetCsvUrl(url: string): string {
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) {
    if (url.includes('format=csv') || url.includes('out:csv')) return url;
    return url;
  }
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
  const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gidParam}`;
}

/**
 * Gets alternative GViz CSV URL for Google Sheets
 */
export function getGoogleSheetGvizCsvUrl(url: string): string {
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) return url;
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
  const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${gidParam}`;
}

/**
 * Fetches Google Sheet CSV content directly or via backend proxy
 */
export async function fetchGoogleSheetDocuments(sheetUrl: string): Promise<AccountingDocument[]> {
  const csvUrl = getGoogleSheetCsvUrl(sheetUrl);
  const gvizUrl = getGoogleSheetGvizCsvUrl(sheetUrl);

  let csvText = '';
  let fetchError = '';

  // 1. Try backend proxy with standard CSV export URL
  try {
    const response = await fetch('/api/google-sheet-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl: csvUrl })
    });

    if (response.ok) {
      const data = await response.json();
      csvText = data.csvText;
    }
  } catch (e: any) {
    fetchError = e.message;
  }

  // 2. Fallback to backend proxy with GViz URL
  if (!csvText || csvText.includes('<!DOCTYPE html')) {
    try {
      const gvizResponse = await fetch('/api/google-sheet-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: gvizUrl })
      });

      if (gvizResponse.ok) {
        const data = await gvizResponse.json();
        if (data.csvText && !data.csvText.includes('<!DOCTYPE html')) {
          csvText = data.csvText;
        }
      }
    } catch (e: any) {
      fetchError = e.message;
    }
  }

  // 3. Fallback to direct client fetch
  if (!csvText || csvText.includes('<!DOCTYPE html')) {
    try {
      const directRes = await fetch(csvUrl);
      if (directRes.ok) {
        const text = await directRes.text();
        if (!text.includes('<!DOCTYPE html')) {
          csvText = text;
        }
      }
    } catch (e: any) {
      fetchError = e.message;
    }
  }

  if (!csvText || csvText.includes('<!DOCTYPE html')) {
    throw new Error(
      'Không thể kết nối tới Google Sheet. Vui lòng đảm bảo Google Sheet đã bật chế độ chia sẻ "Bất kỳ ai có liên kết đều có thể xem" (Anyone with the link can view).'
    );
  }

  return parseCsvToDocuments(csvText, sheetUrl);
}

/**
 * Extracts content inside element with class "content1" if present in raw HTML.
 * (Commonly used by legal websites like thuvienphapluat.vn to hold the document body)
 */
export function extractContent1(htmlContent: string): string {
  if (!htmlContent) return htmlContent;

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      const content1El = doc.querySelector('.content1') || doc.querySelector('#content1');
      if (content1El) {
        // Clean up scripts, styles, or iframe tags
        content1El.querySelectorAll('script, style, iframe').forEach((node) => node.remove());
        const cleanedHtml = content1El.innerHTML.trim();
        if (cleanedHtml) return cleanedHtml;
      }
    } catch (e) {
      console.error('Failed to parse .content1 using DOMParser:', e);
    }
  }

  return htmlContent;
}

/**
 * Parses CSV text mapped flexibly to columns (Col A: ID/Name, Col B: Category/Name/Content, Col C: Name/Content, Col D: Content)
 */
export function parseCsvToDocuments(csvText: string, sourceSheetUrl?: string): AccountingDocument[] {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true,
    header: false
  });

  if (!parsed.data || parsed.data.length === 0) {
    throw new Error('Tệp Google Sheet không chứa dữ liệu hợp lệ.');
  }

  const rows = parsed.data;

  // Extract documents starting from specified row index
  const extractDocs = (startIdx: number): AccountingDocument[] => {
    const results: AccountingDocument[] = [];

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const cells = row.map((c) => (c ? c.trim() : ''));
      const nonEmptyCells = cells.filter((c) => c !== '');
      if (nonEmptyCells.length === 0) continue;

      // 1. Identify content cell
      let contentIdx = -1;

      // Priority A: Cell containing HTML elements, class="content1", or document section headers
      contentIdx = cells.findIndex((cell) => {
        if (!cell) return false;
        return (
          cell.includes('<div') ||
          cell.includes('<p') ||
          cell.includes('<table') ||
          cell.includes('<span') ||
          cell.includes('<br') ||
          cell.includes('content1') ||
          /^(Điều|Chương|Mục)\s+\d+/i.test(cell) ||
          cell.length > 200
        );
      });

      // Priority B: Longest cell in the row
      if (contentIdx === -1) {
        let maxLen = 0;
        cells.forEach((cell, idx) => {
          if (cell.length > maxLen) {
            maxLen = cell.length;
            contentIdx = idx;
          }
        });
      }

      const rawContent = contentIdx !== -1 ? cells[contentIdx] : nonEmptyCells.join('\n');
      if (!rawContent) continue;

      // Remaining cells for ID, Category, Name
      const remainingCells = cells
        .map((cell, idx) => ({ cell, idx }))
        .filter(({ cell, idx }) => idx !== contentIdx && cell !== '');

      let id = '';
      let category = 'Nghị định';
      let name = '';
      let content = '';

      if (cells.length >= 4) {
        // Standard 4-column schema: Col A=ID, Col B=Category, Col C=Name, Col D=Content
        id = cells[0].trim();
        category = cells[1].trim() || 'Nghị định';
        name = cells[2].trim();
        content = extractContent1(cells.slice(3).join('\n'));
      } else if (cells.length === 3) {
        // 3-column schema: Col A=Category/ID, Col B=Name, Col C=Content
        id = cells[0].trim();
        category = 'Nghị định';
        name = cells[1].trim();
        content = extractContent1(cells[2]);
      } else {
        // Fallback for single column / unstructured rows
        content = extractContent1(rawContent);
        if (remainingCells.length > 0) {
          name = remainingCells[0].cell;
        } else {
          name = rawContent.replace(/<[^>]*>/g, '').trim().slice(0, 80) || `Văn bản ${i + 1}`;
        }
      }

      // Filter out header row like "ID", "Category", "Name", "Content" / "Mã", "Thể loại", "Tên", "Nội dung"
      const lowerId = (id || '').toLowerCase();
      const lowerName = (name || '').toLowerCase();
      const lowerCat = (category || '').toLowerCase();

      if (
        (lowerId === 'id' || lowerId === 'mã' || lowerId === 'stt' || lowerId === 'code') &&
        (lowerName.includes('name') || lowerName.includes('tên') || lowerName.includes('content') || lowerName.includes('nội dung') || lowerCat.includes('category') || lowerCat.includes('loại'))
      ) {
        continue;
      }

      if (!id) {
        id = `${i + 1}`;
      }
      if (!name) {
        name = `Văn bản ${i + 1}`;
      }

      results.push({
        id,
        category: category || 'Nghị định',
        name,
        content,
        updatedAt: new Date().toISOString().split('T')[0],
        sourceSheetUrl
      });
    }

    return results;
  };

  // Detect header row
  const firstRow = rows[0];
  let isHeader = false;

  if (firstRow && rows.length > 1) {
    const hasLongCell = firstRow.some((c) => (c || '').length > 120 || (c || '').includes('<div') || (c || '').includes('<p'));
    if (!hasLongCell) {
      isHeader = firstRow.some((cell) => {
        const val = (cell || '').toLowerCase().trim();
        return (
          val === 'stt' ||
          val.includes('id') ||
          val.includes('mã') ||
          val.includes('category') ||
          val.includes('loại') ||
          val.includes('name') ||
          val.includes('tên') ||
          val.includes('content') ||
          val.includes('nội dung') ||
          val.includes('title')
        );
      });
    }
  }

  let docs = extractDocs(isHeader ? 1 : 0);

  // Fallback: If header detection skipped row 0 and yielded 0 docs, retry with startIdx = 0
  if (docs.length === 0 && isHeader) {
    docs = extractDocs(0);
  }

  // Return empty array [] if no docs found (don't throw error)
  return docs;
}
