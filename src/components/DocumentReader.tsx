import React, { useState, useEffect, useRef } from 'react';
import { AccountingDocument, TocItem } from '../types';
import { prepareHtmlWithAnchors } from '../utils/tocParser';
import { 
  Search, 
  BookOpen, 
  Copy, 
  Check, 
  Edit3, 
  Type, 
  ChevronRight, 
  ChevronDown,
  Hash, 
  ListFilter,
  ExternalLink,
  Share2,
  X,
  FileText,
  Info
} from 'lucide-react';

interface DocumentReaderProps {
  document: AccountingDocument;
  onEditDocument: (docId: string) => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({
  document,
  onEditDocument
}) => {
  const [processedHtml, setProcessedHtml] = useState<string>('');
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string>('');
  const [tocSearch, setTocSearch] = useState<string>('');
  const [tocFilter, setTocFilter] = useState<'all' | 'chapter' | 'article'>('all');
  const [contentSearch, setContentSearch] = useState<string>('');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [jumpArticleNum, setJumpArticleNum] = useState<string>('');
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});

  const toggleChapterCollapse = (chapterId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCollapsedChapters((prev) => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  };

  // Selected article for detail TVPL popup modal
  const [selectedArticleModal, setSelectedArticleModal] = useState<{
    id: string;
    title: string;
    htmlContent: string;
  } | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  // Expose global callback and stubs for inline buttons/scripts rendered inside TVPL HTML
  useEffect(() => {
    const win = window as any;

    win.copyArticleLink = (elementId: string, articleTitle: string) => {
      const fullUrl = `${window.location.origin}${window.location.pathname}#${elementId}`;
      navigator.clipboard.writeText(fullUrl);
      setCopiedId(elementId);
      setTimeout(() => setCopiedId(null), 2000);
    };

    // TVPL safety stubs to prevent ReferenceError on imported HTML
    win.LS_Tootip_Type_Bookmark_DC_Archive = win.LS_Tootip_Type_Bookmark_DC_Archive || '';
    win.hideddrivetip = win.hideddrivetip || (() => {});
    win.showdrivetip = win.showdrivetip || (() => {});
    win.ddrivetip = win.ddrivetip || (() => {});
    win.stm = win.stm || (() => {});
    win.ShowPopupDoc = win.ShowPopupDoc || (() => {});

    return () => {
      delete win.copyArticleLink;
    };
  }, []);

  // Process HTML and generate TOC items when document changes
  useEffect(() => {
    if (document && document.content) {
      const { processedHtml: html, items } = prepareHtmlWithAnchors(document.content);
      setProcessedHtml(html);
      setTocItems(items);
      setActiveTocId('');
      setContentSearch('');
      setTocSearch('');
    }
  }, [document]);

  // Helper to find target element by flexible ID, name, or article number
  const toRoman = (num: number): string => {
    const romanMap: [number, string][] = [
      [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
      [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
      [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
    ];
    let result = '';
    let remaining = num;
    for (const [value, numeral] of romanMap) {
      while (remaining >= value) {
        result += numeral;
        remaining -= value;
      }
    }
    return result;
  };

  const fromRoman = (roman: string): number | null => {
    const map: Record<string, number> = {i:1, v:5, x:10, l:50, c:100, d:500, m:1000};
    let total = 0;
    let prev = 0;
    for (let i = roman.length - 1; i >= 0; i -= 1) {
      const value = map[roman[i].toLowerCase()];
      if (!value) return null;
      if (value < prev) {
        total -= value;
      } else {
        total += value;
      }
      prev = value;
    }
    return total;
  };

  const findAnchorVariant = (raw: string): HTMLElement | null => {
    const normalized = raw.trim().toLowerCase();
    const variants = new Set<string>([
      normalized,
      normalized.replace(/_/g, '-'),
      normalized.replace(/-/g, '_')
    ]);

    const chapMatch = normalized.match(/^chuong[-_](\d+)$/i);
    const romanMatch = normalized.match(/^chuong[-_]([ivxlcdm]+)$/i);
    if (chapMatch) {
      const num = Number(chapMatch[1]);
      if (!Number.isNaN(num) && num > 0) {
        const roman = toRoman(num);
        variants.add(`chuong-${roman}`);
        variants.add(`chuong_${roman}`);
      }
    }
    if (romanMatch) {
      const num = fromRoman(romanMatch[1]);
      if (num) {
        variants.add(`chuong-${num}`);
        variants.add(`chuong_${num}`);
      }
    }

    const dieuMatch = normalized.match(/^dieu[-_]?(\d+[\w-]*)$/i);
    if (dieuMatch) {
      variants.add(`dieu-${dieuMatch[1]}`);
      variants.add(`dieu_${dieuMatch[1]}`);
    }

    for (const variant of variants) {
      try {
        const candidate = (
          contentRef.current?.querySelector(`#${CSS.escape(variant)}`) ||
          contentRef.current?.querySelector(`[name="${variant}"]`)
        ) as HTMLElement;
        if (candidate) return candidate;
      } catch (e) {}
    }

    return null;
  };

  const findTargetElement = (idOrName: string): HTMLElement | null => {
    if (!contentRef.current || !idOrName) return null;

    const raw = idOrName.replace(/^#/, '').trim();
    if (!raw) return null;

    const exactEl = findAnchorVariant(raw);
    if (exactEl) return exactEl;

    // 4. Try matching article number from TOC items (e.g. "1", "dieu 1", "3")
    const matchNum = raw.match(/\d+[\w-]*/);
    if (matchNum) {
      const numStr = matchNum[0];
      const matchedToc = tocItems.find((item) => item.number.toLowerCase().includes(numStr.toLowerCase()));
      if (matchedToc) {
        try {
          const tocEl = findAnchorVariant(matchedToc.elementId) || contentRef.current.querySelector(`#${CSS.escape(matchedToc.elementId)}`) as HTMLElement;
          if (tocEl) return tocEl;
        } catch (e) {}
      }
    }

    // 5. Case-insensitive text search fallback for headings or elements containing "Điều X"
    if (raw.toLowerCase().includes('dieu') || matchNum) {
      const numToFind = matchNum ? matchNum[0] : '';
      const allTargets = contentRef.current.querySelectorAll('.doc-toc-target, h1, h2, h3, h4, h5, p, b, strong');
      for (const el of Array.from(allTargets)) {
        const text = (el as HTMLElement).textContent?.trim() || '';
        if (numToFind && new RegExp(`^Điều\\s+${numToFind}\\b`, 'i').test(text)) {
          return el as HTMLElement;
        }
      }
    }

    return null;
  };

  // Google Search fallback for references/articles not found in local HTML
  const handleSearchGoogleForRef = (queryOrText: string) => {
    const cleanText = queryOrText.replace(/^#/, '').replace(/[-_]/g, ' ').trim();
    if (!cleanText) return;

    const docContext = document.name ? ` ${document.name}` : '';
    const searchQuery = `${cleanText}${docContext} thuvienphapluat.vn`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    
    window.open(googleUrl, '_blank', 'noopener,noreferrer');
  };

  // Scroll to anchor function with accurate top-offset calculation
  const scrollToAnchor = (elementId: string) => {
    setActiveTocId(elementId);
    const targetEl = findTargetElement(elementId);

    if (targetEl) {
      targetEl.style.scrollMarginTop = '120px';
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Add temporary pulse highlight class (Thư Viện Pháp Luật Style)
      targetEl.classList.add('ring-4', 'ring-red-500/80', 'bg-amber-100/90', 'transition-all', 'duration-500', 'rounded-sm');
      setTimeout(() => {
        targetEl.classList.remove('ring-4', 'ring-red-500/80', 'bg-amber-100/90');
      }, 2500);
    } else {
      // If target article/reference is not present in local HTML, search Google for it!
      handleSearchGoogleForRef(elementId);
    }
  };

  // Intercept clicks on links rendered inside HTML content
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');

    if (anchor) {
      e.preventDefault();
      e.stopPropagation();

      const href = anchor.getAttribute('href') || '';
      const linkText = anchor.textContent?.trim() || anchor.getAttribute('title') || '';

      // Check if it's an internal fragment link in current document (#dieu-1, #chuong-2)
      if (href.startsWith('#') && href.length > 1) {
        const targetId = href.substring(1);
        const el = findTargetElement(targetId);
        if (el) {
          scrollToAnchor(targetId);
          return;
        }
      }

      // If link text or href refers to another legal document, open Google Search to find it!
      let searchQuery = linkText;
      if (!searchQuery && href) {
        searchQuery = href.replace(/.*\/van-ban\//, '').replace(/[^a-zA-Z0-9\s]/g, ' ');
      }

      searchQuery = searchQuery.trim() || 'thuvienphapluat.vn';
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery + ' thuvienphapluat.vn')}`;
      window.open(googleUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Jump to article number handler
  const handleJumpToArticle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jumpArticleNum) return;

    const cleanNum = jumpArticleNum.trim().replace(/^điều\s*/i, '');
    const found = tocItems.find(
      (item) => item.type === 'article' && item.number.toLowerCase().includes(cleanNum.toLowerCase())
    );

    if (found) {
      scrollToAnchor(found.elementId);
    } else {
      const fallbackId = `dieu-${cleanNum}`;
      scrollToAnchor(fallbackId);
    }
    setJumpArticleNum('');
  };

  // Copy text helper
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const itemIndexMap = tocItems.reduce((map, item, index) => {
    map[item.id] = index;
    return map;
  }, {} as Record<string, number>);

  const parseHeadingValue = (text: string) => {
    const articleMatch = text.match(/Điều\s+(\d+)/i);
    if (articleMatch) return Number(articleMatch[1]);

    const romanMatch = text.match(/Chương\s+([IVXLCDM]+)/i);
    if (romanMatch) {
      const roman = romanMatch[1].toLowerCase();
      const value = fromRoman(roman);
      return value || 0;
    }

    const sectionMatch = text.match(/Mục\s+(\d+)/i);
    if (sectionMatch) return Number(sectionMatch[1]);

    return 0;
  };

  const typeWeight: Record<string, number> = {
    chapter: 1,
    section: 2,
    article: 3
  };

  const sortedTocItems = [...tocItems].sort((a, b) => {
    const aGroupOrder = a.type === 'chapter' ? itemIndexMap[a.id] : a.chapterId ? itemIndexMap[a.chapterId] : itemIndexMap[a.id];
    const bGroupOrder = b.type === 'chapter' ? itemIndexMap[b.id] : b.chapterId ? itemIndexMap[b.chapterId] : itemIndexMap[b.id];

    if (aGroupOrder !== bGroupOrder) {
      return aGroupOrder - bGroupOrder;
    }

    if (typeWeight[a.type] !== typeWeight[b.type]) {
      return typeWeight[a.type] - typeWeight[b.type];
    }

    const aValue = parseHeadingValue(a.number);
    const bValue = parseHeadingValue(b.number);
    if (aValue !== bValue) {
      return aValue - bValue;
    }

    return itemIndexMap[a.id] - itemIndexMap[b.id];
  });

  // Filter TOC items
  const filteredTocItems = sortedTocItems.filter((item) => {
    const matchesType =
      tocFilter === 'all' ||
      (tocFilter === 'chapter' && item.type === 'chapter') ||
      (tocFilter === 'article' && item.type === 'article');

    const matchesSearch =
      !tocSearch ||
      item.number.toLowerCase().includes(tocSearch.toLowerCase()) ||
      item.title.toLowerCase().includes(tocSearch.toLowerCase()) ||
      item.rawText.toLowerCase().includes(tocSearch.toLowerCase());

    return matchesType && matchesSearch;
  });

  const chaptersCount = tocItems.filter((i) => i.type === 'chapter').length;
  const articlesCount = tocItems.filter((i) => i.type === 'article').length;

  const fontClasses = {
    sm: 'text-sm leading-relaxed',
    base: 'text-base leading-relaxed',
    lg: 'text-lg leading-loose',
    xl: 'text-xl leading-loose'
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* TVPL Style Document Meta Header Card */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-red-700 text-white font-mono text-xs font-extrabold px-2.5 py-0.5 rounded shadow-2xs">
              TVPL ID: {document.id}
            </span>
            <span className="bg-slate-100 text-slate-800 font-bold text-xs px-2.5 py-0.5 rounded border border-slate-200">
              {document.category || 'Văn bản pháp luật'}
            </span>
            
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
            {document.name}
          </h2>

          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 pt-1">
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-red-700" />
              <strong>{chaptersCount}</strong> Chương
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-blue-700" />
              <strong>{articlesCount}</strong> Điều chi tiết
            </span>
            {document.officialUrl && (
              <>
                <span>•</span>
                <a
                  href={document.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 font-bold underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Mở link thuvienphapluat.vn gốc
                </a>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
          
        </div>
      </div>

      {/* Main Two-Column Reader Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: TVPL Interactive Table of Contents */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden sticky top-20 z-10">
          
          {/* TOC Header */}
          
          {/* TOC Items Scrollable List */}
          <div className="max-h-[65vh] overflow-y-auto p-2 space-y-1 divide-y divide-slate-100 no-scrollbar">
            {filteredTocItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                <p>Không tìm thấy mục nào khớp với tìm kiếm.</p>
              </div>
            ) : (
              filteredTocItems.map((item) => {
                const isChapter = item.type === 'chapter';
                const isActive = activeTocId === item.elementId;
                const isCollapsed = isChapter && !!collapsedChapters[item.id];

                // If this is an article/section belonging to a collapsed chapter, hide it unless searching
                if (!isChapter && !tocSearch && item.chapterId && collapsedChapters[item.chapterId]) {
                  return null;
                }

                if (isChapter) {
                  return (
                    <div
                      key={item.id}
                      className={`group flex items-center justify-between gap-2 p-2 rounded cursor-pointer transition text-xs font-bold bg-slate-100 hover:bg-red-50 text-red-950 mt-2 border-l-4 border-red-700 ${
                        isActive ? 'bg-amber-100 ring-2 ring-red-500' : ''
                      }`}
                      onClick={() => {
                        scrollToAnchor(item.elementId);
                        if (isCollapsed) {
                          toggleChapterCollapse(item.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => toggleChapterCollapse(item.id, e)}
                          className="p-1 hover:bg-red-200/60 rounded text-red-700 transition cursor-pointer shrink-0"
                          title={isCollapsed ? 'Mở rộng danh sách Điều' : 'Thu gọn danh sách Điều'}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-red-700 font-extrabold" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-red-700 font-extrabold" />
                          )}
                        </button>
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-red-700 text-white font-bold shrink-0">
                          {item.number}
                        </span>
                        <span className="truncate group-hover:text-red-900 font-bold">
                          {item.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-normal shrink-0">
                        {isCollapsed ? '▶ Thu gọn' : '▼ Chi tiết'}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => scrollToAnchor(item.elementId)}
                    className={`group flex items-start gap-2 p-2 rounded cursor-pointer transition text-xs font-medium pl-6 ${
                      isActive
                        ? 'bg-amber-100 text-red-950 border-l-4 border-red-700 font-bold shadow-2xs'
                        : 'hover:bg-amber-50 text-slate-800 border-l-2 border-slate-200 hover:border-red-400'
                    }`}
                  >
                    <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400 group-hover:text-red-600 transition" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-mono bg-slate-200 text-slate-800 font-semibold">
                          {item.number}
                        </span>
                        <span className="truncate group-hover:text-red-800">
                          {item.title}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: HTML Reader Container */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          
          {/* Reader Controls Toolbar */}
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
             
              <div className="inline-flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-2xs text-xs font-bold">
                <button
                  onClick={() => setFontSize('sm')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${fontSize === 'sm' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  A-
                </button>
                <button
                  onClick={() => setFontSize('base')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${fontSize === 'base' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  A
                </button>
                <button
                  onClick={() => setFontSize('lg')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${fontSize === 'lg' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  A+
                </button>
              </div>
            </div>

            {/* In-Document Search */}
         
          </div>

          {/* Rendered HTML Document Content */}
          <div className="p-6 sm:p-8 overflow-x-auto min-h-[500px]">
            <div
              ref={contentRef}
              onClick={handleContentClick}
              className={`prose prose-slate max-w-none ${fontClasses[fontSize]} selection:bg-amber-200 selection:text-slate-900`}
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          </div>

        </div>

      </div>

      {/* Article Detail Modal / Popout (TVPL Feature) */}
      {selectedArticleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-300 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-red-800 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-sm tracking-wide">
                  CHI TIẾT: {selectedArticleModal.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedArticleModal(null)}
                className="p-1 hover:bg-red-700 rounded text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-sm leading-relaxed text-slate-800 space-y-4">
              <div
                dangerouslySetInnerHTML={{ __html: selectedArticleModal.htmlContent }}
              />
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500">Mã liên kết: #{selectedArticleModal.id}</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleCopyText(selectedArticleModal.htmlContent, selectedArticleModal.id)}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Sao chép nội dung
                </button>
                <button
                  onClick={() => setSelectedArticleModal(null)}
                  className="px-4 py-1.5 bg-red-700 text-white rounded text-xs font-bold hover:bg-red-800 cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
