import React, { useState, useEffect } from 'react';
import { AccountingDocument, GoogleSheetSettings } from './types';
import { INITIAL_DOCUMENTS } from './data/sampleDocuments';
import { fetchGoogleSheetDocuments } from './utils/googleSheetSync';
import { Header } from './components/Header';
import { DocumentReader } from './components/DocumentReader';
import { SettingsManager } from './components/SettingsManager';
import { FileSpreadsheet, Plus } from 'lucide-react';

export default function App() {
  // LocalStorage keys
  const DOCS_KEY = 'accounting_legal_docs_v1';
  const SETTINGS_KEY = 'accounting_sheet_settings_v1';

  // Load documents state (if saved array exists, return it even if empty)
  const [documents, setDocuments] = useState<AccountingDocument[]>(() => {
    try {
      const saved = localStorage.getItem(DOCS_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load local documents:', e);
    }
    return [];
  });

  // Selected active document ID
  const [selectedDocId, setSelectedDocId] = useState<string>(() => {
    return documents[0]?.id || '';
  });

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'reader' | 'settings'>('reader');

  // Editing document ID for Settings tab
  const [editingDocId, setEditingDocId] = useState<string>('');

  // Default Google Sheet URL provided by user
  const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1AXvaB4LyBUkCeeI6dxqwXY3YrQYhYlozZeqSmR3u0xY/edit?usp=sharing';

  // Google Sheet Settings
  const [sheetSettings, setSheetSettings] = useState<GoogleSheetSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.sheetUrl) return parsed;
      }
    } catch (e) {
      console.error('Failed to load sheet settings:', e);
    }
    return { sheetUrl: DEFAULT_SHEET_URL, autoSyncOnLoad: true };
  });

  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Auto-sync Google Sheet on initial mount if configured
  useEffect(() => {
    if (sheetSettings.sheetUrl) {
      handleSyncSheet();
    }
  }, []);

  // Save documents to localStorage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(DOCS_KEY, JSON.stringify(documents));
    } catch (e) {
      console.error('Failed to persist documents:', e);
    }
  }, [documents]);

  // Save sheet settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(sheetSettings));
    } catch (e) {
      console.error('Failed to persist sheet settings:', e);
    }
  }, [sheetSettings]);

  // Sync Google Sheet
  const handleSyncSheet = async (isManual = false) => {
    if (!sheetSettings.sheetUrl) return;
    setIsSyncing(true);
    try {
      const newDocs = await fetchGoogleSheetDocuments(sheetSettings.sheetUrl);
      setDocuments(newDocs || []);
      
      if (newDocs && newDocs.length > 0) {
        if (!newDocs.some((d) => d.id === selectedDocId)) {
          setSelectedDocId(newDocs[0].id);
        }
      } else {
        setSelectedDocId('');
      }

      setSheetSettings((prev) => ({
        ...prev,
        lastSyncedAt: new Date().toLocaleTimeString('vi-VN')
      }));

      if (isManual) {
        if (newDocs.length === 0) {
          alert('Google Sheet hiện tại đang trống (0 văn bản).');
        } else {
          alert(`Đồng bộ thành công ${newDocs.length} văn bản từ Google Sheet!`);
        }
      }
    } catch (err: any) {
      console.error('Sheet Sync Failed:', err);
      if (isManual) {
        alert(err.message || 'Không thể đồng bộ dữ liệu từ Google Sheet.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Add or edit document
  const handleSaveDocument = (docToSave: AccountingDocument) => {
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.id === docToSave.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = docToSave;
        return copy;
      }
      return [docToSave, ...prev];
    });
    setSelectedDocId(docToSave.id);
  };

  // Delete document
  const handleDeleteDocument = (docId: string) => {
    setDocuments((prev) => {
      const filtered = prev.filter((d) => d.id !== docId);
      if (filtered.length > 0 && selectedDocId === docId) {
        setSelectedDocId(filtered[0].id);
      }
      return filtered;
    });
  };

  // Import batch documents (e.g. from Google Sheet sync or JSON)
  const handleImportDocuments = (docs: AccountingDocument[], overwrite: boolean) => {
    if (overwrite) {
      setDocuments(docs);
      if (docs.length > 0) setSelectedDocId(docs[0].id);
    } else {
      setDocuments((prev) => {
        const mergedMap = new Map<string, AccountingDocument>();
        prev.forEach((d) => mergedMap.set(d.id, d));
        docs.forEach((d) => mergedMap.set(d.id, d));
        return Array.from(mergedMap.values());
      });
    }
  };

  // Reset to default sample documents
  const handleResetToDefault = () => {
    setDocuments(INITIAL_DOCUMENTS);
    setSelectedDocId(INITIAL_DOCUMENTS[0].id);
    localStorage.removeItem(DOCS_KEY);
  };

  // Go to edit document in settings
  const handleEditDocumentInSettings = (docId: string) => {
    setEditingDocId(docId);
    setActiveTab('settings');
  };

  const selectedDocument = documents.find((d) => d.id === selectedDocId) || documents[0];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans antialiased flex flex-col">
      {/* Header with Document Selector Dropdown */}
      <Header
        documents={documents}
        selectedDocId={selectedDocId}
        onSelectDocument={(id) => setSelectedDocId(id)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sheetSettings={sheetSettings}
        onSyncSheet={() => handleSyncSheet(true)}
        isSyncing={isSyncing}
      />

      {/* Body Content according to active tab */}
      <main className="flex-1 pb-12">
        {activeTab === 'reader' && (
          selectedDocument ? (
            <DocumentReader
              document={selectedDocument}
              onEditDocument={handleEditDocumentInSettings}
            />
          ) : (
            <div className="max-w-2xl mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-4 shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto text-red-600">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-slate-800">Chưa Có Văn Bản Nào Trong Google Sheet</h2>
              
              <button
                onClick={() => setActiveTab('settings')}
                className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-sm transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                
              </button>
            </div>
          )
        )}

        {activeTab === 'settings' && (
          <SettingsManager
            documents={documents}
            onSaveDocument={handleSaveDocument}
            onDeleteDocument={handleDeleteDocument}
            onImportDocuments={handleImportDocuments}
            onResetToDefault={handleResetToDefault}
            sheetSettings={sheetSettings}
            onUpdateSheetSettings={setSheetSettings}
            editingDocId={editingDocId}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-4 border-t border-slate-800 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
         
        </div>
      </footer>
    </div>
  );
}

