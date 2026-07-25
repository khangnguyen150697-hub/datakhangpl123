import { TocItem } from '../types';

/**
 * Normalizes Vietnamese text to clean ID slug
 * e.g. "Điều 1. Phạm vi điều chỉnh" -> "dieu-1"
 */
export function slugifySection(text: string, index: number): string {
  const clean = text.toLowerCase().trim();
  const dieuMatch = clean.match(/điều\s+(\d+[\w-]*)/i);
  if (dieuMatch) return `dieu-${dieuMatch[1]}`;

  const chuongMatch = clean.match(/chương\s+([ivxlcdm\d]+)/i);
  if (chuongMatch) return `chuong-${chuongMatch[1]}`;

  const mucMatch = clean.match(/mục\s+([ivxlcdm\d]+)/i);
  if (mucMatch) return `muc-${mucMatch[1]}`;

  return `sec-${index}-${clean.replace(/[^a-z0-9]+/g, '-').slice(0, 20)}`;
}

/**
 * Injects DOM element IDs into HTML string for chapters and articles
 * if they don't already exist, ensuring smooth-scroll links work.
 */
export function prepareHtmlWithAnchors(htmlContent: string): { processedHtml: string; items: TocItem[] } {
  if (typeof window === 'undefined') {
    return { processedHtml: htmlContent, items: [] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Remove script tags that might throw TVPL reference errors
  doc.querySelectorAll('script').forEach((s) => s.remove());

  // Clean inline event attributes that call non-existent TVPL functions
  doc.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith('on')) {
        // Retain copyArticleLink if present, strip TVPL legacy handlers like hideddrivetip, showdrivetip
        if (!attr.value.includes('copyArticleLink')) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });

  // Ensure all <a> links inside HTML are visually styled as active links
  doc.querySelectorAll('a').forEach((aEl) => {
    if (!aEl.className || !aEl.className.includes('text-')) {
      aEl.classList.add('text-blue-700', 'hover:text-red-700', 'underline', 'font-semibold', 'transition-colors', 'cursor-pointer');
    }
  });

  const items: TocItem[] = [];
  const processedElementIds = new Set<string>();

  const ensureAnchorTarget = (el: Element, targetId: string) => {
    if (!el.getAttribute('id')) {
      el.setAttribute('id', targetId);
    }
    const anchorName = targetId.replace(/-/g, '_');
    if (!el.getAttribute('name')) {
      el.setAttribute('name', anchorName);
    }
  };

  const candidateElements = Array.from(
    doc.body.querySelectorAll('h1, h2, h3, h4, h5, p, div, td, th, li')
  );
  let elementCounter = 0;
  let currentChapterId: string | undefined = undefined;

  const createTitle = (numberText: string, rawRest: string) => {
    const rest = rawRest.trim().replace(/^[\s\.:\-–]+/, '').trim();
    const genericTitlePattern = /^(như sau|được quy định như sau|được quy định|bao gồm|gồm|các khoản|các điều khoản|người lao động|được thực hiện như sau)[:\s]*$/i;
    if (!rest || genericTitlePattern.test(rest) || rest.length < 5) {
      return numberText;
    }
    return `${numberText}. ${rest}`;
  };

  const headingPrefix = (text: string) => {
    const match = text.match(/^(Chương\s+[IVXLCDM0-9]+|Điều\s+\d+[\w-]*|Mục\s+[IVXLCDM0-9]+)(?:[\s\.\:\-–]|$)/i);
    return match ? match[1] : null;
  };

  const startsWithHeading = (text: string) => headingPrefix(text) !== null;

  const getImmediateText = (el: Element) =>
    Array.from(el.childNodes)
      .filter((node): node is Text => node.nodeType === 3)
      .map((textNode) => textNode.textContent?.trim().replace(/\s+/g, ' ') || '')
      .join(' ')
      .trim();

  // We prefer block-level headings, but elements that only contain a single
  // anchor with heading-like text should be considered as low-priority
  // candidates (fallback) rather than being skipped entirely.

  const scoreCandidate = (tagName: string, rawText: string) => {
    let score = rawText.trim().length;
    if (['P', 'DIV', 'TD', 'TH', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5'].includes(tagName)) {
      score += 20;
    }
    if (/\.|:|–|-/.test(rawText)) {
      score += 20;
    }
    if (/\b(Nghị định này|Thông tư này|như sau|được quy định|Nghị định này)\b/i.test(rawText)) {
      score -= 40;
    }
    if (rawText.length < 10) {
      score -= 10;
    }
    return score;
  };

  const bestHeadingCandidates = new Map<string, {
    el: Element;
    prefix: string;
    type: 'chapter' | 'article' | 'section';
    numStr: string;
    titleStr: string;
    rawText: string;
    score: number;
    index: number;
  }>();

  candidateElements.forEach((el, index) => {
    const text = el.textContent?.trim().replace(/\s+/g, ' ') || '';
    if (!text) return;

    const prefix = headingPrefix(text);
    if (!prefix) return;

    const childHeadingElements = Array.from(el.children).filter((child) => {
      const childText = (child.textContent || '').trim().replace(/\s+/g, ' ');
      return headingPrefix(childText) !== null;
    });
    const invalidChildHeading = childHeadingElements.find(
      (child) => !['A', 'SPAN', 'STRONG', 'EM', 'B', 'I'].includes(child.tagName)
    );
    if (invalidChildHeading && !startsWithHeading(getImmediateText(el))) return;

    const chuongMatch = text.match(/^(Chương\s+[IVXLCDM0-9]+)\b[\.\:\s\-\–]*(.*)/i);
    const dieuMatch = text.match(/^(Điều\s+\d+[\w-]*)\b[\.\:\s\-\–]*(.*)/i);
    const mucMatch = text.match(/^(Mục\s+[IVXLCDM0-9]+)\b[\.\:\s\-\–]*(.*)/i);

    let type: 'chapter' | 'article' | 'section' | null = null;
    let numStr = '';
    let titleStr = text;

    if (chuongMatch) {
      type = 'chapter';
      numStr = chuongMatch[1];
      titleStr = chuongMatch[2] || text;
    } else if (dieuMatch) {
      type = 'article';
      numStr = dieuMatch[1];
      titleStr = createTitle(numStr, dieuMatch[2] || text);
    } else if (mucMatch) {
      type = 'section';
      numStr = mucMatch[1];
      titleStr = mucMatch[2] || text;
    }

    if (!type) return;

    // detect single-anchor wrappers with no immediate text — treat them as
    // lower priority by penalizing score, so block headings win when present
    const anchors = Array.from(el.querySelectorAll('a'));
    const isWrapperAnchor = anchors.length === 1 && !getImmediateText(el) && headingPrefix(anchors[0].textContent || '') !== null;
    let candidateScore = scoreCandidate(el.tagName, text);
    if (isWrapperAnchor) candidateScore -= 30;
    const key = prefix.toLowerCase();
    const existing = bestHeadingCandidates.get(key);
    if (!existing || candidateScore > existing.score || (candidateScore === existing.score && index < existing.index)) {
      bestHeadingCandidates.set(key, {
        el,
        prefix,
        type,
        numStr,
        titleStr,
        rawText: text,
        score: candidateScore,
        index
      });
    }
  });

  const sortedCandidates = Array.from(bestHeadingCandidates.values()).sort((a, b) => a.index - b.index);

  sortedCandidates.forEach((candidate) => {
    const { el, type, numStr, titleStr, rawText } = candidate;
    elementCounter++;

    let targetId = el.getAttribute('id');
    if (!targetId) {
      targetId = slugifySection(rawText, elementCounter);
    }
    ensureAnchorTarget(el, targetId);

    if (processedElementIds.has(targetId)) return;
    processedElementIds.add(targetId);
    el.classList.add('doc-toc-target', 'scroll-mt-28');

    if (type === 'chapter') {
      const chapterItem: TocItem = {
        id: `toc-chap-${elementCounter}`,
        type: 'chapter',
        number: numStr,
        title: titleStr.trim() || rawText,
        elementId: targetId,
        rawText,
        level: 1
      };
      currentChapterId = chapterItem.id;
      items.push(chapterItem);
      return;
    }

    const item: TocItem = {
      id: type === 'article' ? `toc-art-${elementCounter}` : `toc-sec-${elementCounter}`,
      type,
      number: numStr,
      title: titleStr.trim() || rawText,
      elementId: targetId,
      rawText,
      level: type === 'section' ? 3 : 2,
      chapterId: currentChapterId
    };

    items.push(item);
  });

  return {
    processedHtml: doc.body.innerHTML,
    items
  };
}

