import React from 'react';
import { AccountingDocument, GoogleSheetSettings } from '../types';
import { 
  BookOpen, 
  Settings, 
  FileText, 
  RefreshCw, 
  ChevronDown,
  Layers
} from 'lucide-react';

interface HeaderProps {
  documents: AccountingDocument[];
  selectedDocId: string;
  onSelectDocument: (id: string) => void;
  activeTab: 'reader' | 'settings';
  setActiveTab: (tab: 'reader' | 'settings') => void;
  sheetSettings: GoogleSheetSettings;
  onSyncSheet: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  documents,
  selectedDocId,
  onSelectDocument,
  activeTab,
  setActiveTab,
  sheetSettings,
  onSyncSheet,
  isSyncing
}) => {
  const selectedDoc = documents.find((d) => d.id === selectedDocId) || documents[0];

  // Group documents by Category (Thông tư, Nghị định, Luật...)
  const categories = Array.from(new Set(documents.map((d) => d.category || 'Văn bản khác')));

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-3">
          
          {/* Logo & Main Title */}
         
          

          {/* Main Dropdown List Selector */}
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <select
                id="document-selector-dropdown"
                value={selectedDocId}
                onChange={(e) => onSelectDocument(e.target.value)}
                className="w-[900px] bg-slate-800/90 text-white pl-9 pr-10 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium transition cursor-pointer appearance-none shadow-inner"
              >
                {documents.length === 0 ? (
                  <option value="" disabled>-- Chưa có văn bản nào --</option>
                ) : (
                  categories.map((cat) => (
                    <optgroup key={cat} label={`📂 ${cat}`} className="bg-slate-900 text-slate-300 font-semibold">
                      {documents
                        .filter((d) => (d.category || 'Văn bản khác') === cat)
                        .map((doc) => (
                          <option key={doc.id} value={doc.id} className="bg-slate-900 text-white py-1">
                            [{doc.id}] {doc.name}
                          </option>
                        ))}
                    </optgroup>
                  ))
                )}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Quick Sheet Sync & Nav Actions */}
          <div className="flex items-center space-x-2">
            {sheetSettings.sheetUrl && (
              <button
                onClick={onSyncSheet}
                disabled={isSyncing}
                title="Đồng bộ nhanh dữ liệu từ Google Sheet"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
              </button>
            )}

            
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 border-t border-slate-800 pt-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('reader')}
            className={`flex items-center space-x-2 px-4 py-2 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'reader'
                ? 'border-red-500 text-red-400 bg-red-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-t-lg'
            }`}
          >
           
            <span>Tra Cứu</span>
            {selectedDoc && (
              <span className="ml-1 bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                {selectedDoc.id}
              </span>
            )}
          </button>

        <button
  onClick={() => {
    const password = prompt("Nhập mật khẩu");

    if (password === null) return; // Bấm Hủy

    if (password === "khang123") {
      setActiveTab("settings");
    } else {
      alert("Sai mật khẩu");
    }
  }}
  className={`...`}
>
  <span>Cài Đặt</span>
</button>
        </div>

      </div>
    </header>
  );
};

