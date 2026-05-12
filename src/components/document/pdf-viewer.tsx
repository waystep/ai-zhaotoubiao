"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface IssueLocation {
  pageNumber: number;
  blockIndex: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  textSnippet?: string;
  highlightText?: string;
}

export interface DocumentBlock {
  id: string;
  pageNumber: number;
  blockIndex: number;
  blockType: string | null;
  content: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

interface PdfViewerProps {
  documentId: string;
  blocks?: DocumentBlock[];
  highlightedIssues?: IssueLocation[];
  /** 当前被选中/聚焦的问题，在 PDF 上用醒目样式区分 */
  focusedIssue?: IssueLocation | null;
  /** 仅用于 hover 联动：不触发滚动，仅改变高亮样式 */
  hoveredIssue?: IssueLocation | null;
  /** PDF 标识 hover 回调（用于反向联动问题列表） */
  onIssueHover?: (issue: IssueLocation | null) => void;
  /** 用于显示统一编号（key = `${pageNumber}-${blockIndex}`） */
  issueNoByKey?: Record<string, number>;
  /**
   * 当本次 focusedIssue 触发的“定位滚动”执行后回调（用于一次性定位：定位完成即清理 focusedIssue，避免滚动回弹）
   */
  onFocusedIssueConsumed?: () => void;
  currentPage?: number;
  onPageChange?: (pageNumber: number) => void;
  activePopover?: { title: string; desc: string; consequence?: string; legalRef?: string; page: number; blockIdx: number } | null;
  onDismissPopover?: () => void;
}

function mapBoxToOverlay(
  box: { x0: number; y0: number; x1: number; y1: number },
  refW: number,
  refH: number,
  overlayW: number,
  overlayH: number,
  inset: number = 0
) {
  // MinerU bbox 使用左上角原点，与 CSS overlay 一致
  const left = (box.x0 / refW) * overlayW - inset;
  const top = (box.y0 / refH) * overlayH - inset;
  const width = ((box.x1 - box.x0) / refW) * overlayW + inset * 2;
  const height = ((box.y1 - box.y0) / refH) * overlayH + inset * 2;
  return { left, top, width: Math.max(width, 1), height: Math.max(height, 1) };
}

function boxForIssue(issue: IssueLocation, pageBlocks: DocumentBlock[]) {
  const b = issue.bbox;
  if (b && b.x1 > b.x0 && b.y1 > b.y0) return b;
  const block = pageBlocks.find((x) => x.blockIndex === issue.blockIndex);
  return block?.bbox ?? null;
}

export function PdfViewer({
  documentId,
  blocks = [],
  highlightedIssues = [],
  focusedIssue,
  hoveredIssue,
  onIssueHover,
  issueNoByKey,
  onFocusedIssueConsumed,
  currentPage,
  onPageChange,
  activePopover,
  onDismissPopover,
}: PdfViewerProps) {
  const issueKey = useCallback((loc: IssueLocation) => `${loc.pageNumber}-${loc.blockIndex}`, []);
  const fileUrl = useMemo(() => `/api/documents/${documentId}/file`, [documentId]);
  const documentOptions = useMemo(() => ({ withCredentials: true as const }), []);

  const [numPages, setNumPages] = useState(0);
  const [activePage, setActivePage] = useState(() => Math.max(1, currentPage ?? 1));
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(720);

  // Base page dimensions — recorded once from page 1 render, stable across zoom changes.
  // This eliminates highlight overlay flash: overlaySize is always derived, never null after first render.
  const [pageBaseDims, setPageBaseDims] = useState<{ w: number; h: number } | null>(null);
  // Per-page PDF dimensions (points at scale 1), keyed by page number
  const pageRefDims = useRef<Map<number, { w: number; h: number }>>(new Map());

  const [pdfReady, setPdfReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Page number input
  const [pageInputValue, setPageInputValue] = useState("");
  const [pageInputFocused, setPageInputFocused] = useState(false);

  /** 仅用于量宽：不受内部 PDF 滚动条出现/消失影响（与滚动区 sibling，同级占满行） */
  const widthProbeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Map from page number → DOM element for scrollIntoView
  const pageEls = useRef<Map<number, HTMLDivElement>>(new Map());
  // Per-page actual rendered dimensions (offsetWidth/Height)
  const pageDims = useRef<Map<number, { w: number; h: number }>>(new Map());
  const lastIoPageRef = useRef(0);
  const widthRafRef = useRef<number | null>(null);
  const lastWidthRef = useRef(0);
  /** 各页当前 intersectionRatio（observer 每次只回调变化的条目，须累加更新） */
  const pageRatioRef = useRef<Map<number, number>>(new Map());
  /**
   * 正在执行 programmatic scrollIntoView 时设为目标页号（非 0），
   * IntersectionObserver 期间跳过 onPageChange，防止父组件更新 currentPage 后再次触发滚动振荡。
   * 滚动完成（~700ms）后清零。
   */
  const progScrollTargetRef = useRef(0);
  const progScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageWidth = Math.round(Math.max(240, containerWidth * zoom));

  // Derived overlay size — always in sync with current pageWidth, no clearing needed
  const overlaySize = pageBaseDims
    ? { w: pageWidth, h: Math.round((pageWidth / pageBaseDims.w) * pageBaseDims.h) }
    : null;

  const totalPagesLabel = numPages > 0 ? numPages : Math.max(1, ...blocks.map((b) => b.pageNumber), 0);

  // ─── Reset on document change ──────────────────────────────────────────────
  useEffect(() => {
    setNumPages(0);
    setPdfReady(false);
    setLoadError(null);
    setPageBaseDims(null);
    setActivePage(Math.max(1, currentPage ?? 1));
    pageEls.current.clear();
    pageDims.current.clear();
    pageRefDims.current.clear();
    lastIoPageRef.current = 0;
    lastWidthRef.current = 0;
    pageRatioRef.current.clear();
    progScrollTargetRef.current = 0;
    if (progScrollTimerRef.current) clearTimeout(progScrollTimerRef.current);
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Container width：量宽与滚动分离 + rAF 合并，减少滚动条/子树重排导致的连续重绘 ───
  useEffect(() => {
    const el = widthProbeRef.current;
    if (!el) return;

    const applyWidth = (w: number) => {
      const next = Math.max(240, Math.floor(w - 16));
      if (Math.abs(next - lastWidthRef.current) < 2) return;
      lastWidthRef.current = next;
      setContainerWidth(next);
    };

    const ro = new ResizeObserver(() => {
      if (widthRafRef.current != null) cancelAnimationFrame(widthRafRef.current);
      widthRafRef.current = requestAnimationFrame(() => {
        widthRafRef.current = null;
        applyWidth(el.clientWidth);
      });
    });
    ro.observe(el);
    applyWidth(el.clientWidth);
    return () => {
      ro.disconnect();
      if (widthRafRef.current != null) cancelAnimationFrame(widthRafRef.current);
    };
  }, []);

  // ─── Scroll-based active page tracking via IntersectionObserver ───────────
  useEffect(() => {
    if (numPages <= 0 || !pdfReady) return;
    const container = scrollRef.current;
    if (!container) return;

    const ratios = pageRatioRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const p = parseInt(e.target.getAttribute("data-page") ?? "0", 10);
          if (p > 0) ratios.set(p, e.intersectionRatio);
        }
        let best = -1;
        let bestPage = 0;
        for (const [p, r] of ratios) {
          if (r > best) {
            best = r;
            bestPage = p;
          }
        }
        if (bestPage > 0 && bestPage !== lastIoPageRef.current) {
          lastIoPageRef.current = bestPage;
          setActivePage(bestPage);
          // 屏蔽 programmatic scroll 期间的回调，防止父组件更新 currentPage 造成振荡
          if (progScrollTargetRef.current === 0) {
            onPageChange?.(bestPage);
          }
        }
      },
      { root: container, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0] }
    );

    for (const [, el] of pageEls.current) observer.observe(el);
    return () => observer.disconnect();
  }, [numPages, pdfReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Clamp activePage after PDF loads ─────────────────────────────────────
  useEffect(() => {
    if (numPages <= 0) return;
    setActivePage((p) => Math.min(Math.max(1, p), numPages));
  }, [numPages]);

  // ─── PDF load callbacks ───────────────────────────────────────────────────
  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setPdfReady(true);
    setLoadError(null);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error("[PdfViewer] 文档加载失败:", err);
    setLoadError(err?.message || "无法加载 PDF");
    setPdfReady(true);
  }, []);

  // Record base dims from page 1 render — only once, stable across zoom.
  const handlePage1RenderSuccess = useCallback(
    (page: { getViewport: (opts: { scale: number }) => { width: number; height: number } }) => {
      setPageBaseDims((prev) => {
        if (prev) return prev;
        const base = page.getViewport({ scale: 1 });
        return { w: base.width, h: base.height };
      });
    },
    []
  );

  // Record per-page PDF reference dimensions
  const handlePageRenderSuccess = useCallback(
    (pageNum: number) =>
      (page: { getViewport: (opts: { scale: number }) => { width: number; height: number } }) => {
        if (!pageRefDims.current.has(pageNum)) {
          const vp = page.getViewport({ scale: 1 });
          pageRefDims.current.set(pageNum, { w: vp.width, h: vp.height });
        }
      },
    []
  );

  // ─── Per-page highlight overlay ───────────────────────────────────────────
  const highlightsByPage = useMemo(() => {
    const map = new Map<number, IssueLocation[]>();
    for (const issue of highlightedIssues) {
      const list = map.get(issue.pageNumber) ?? [];
      list.push(issue);
      map.set(issue.pageNumber, list);
    }
    return map;
  }, [highlightedIssues]);

  const blocksByPage = useMemo(() => {
    const map = new Map<number, DocumentBlock[]>();
    for (const b of blocks) {
      const list = map.get(b.pageNumber) ?? [];
      list.push(b);
      map.set(b.pageNumber, list);
    }
    return map;
  }, [blocks]);

  // ─── Navigation helpers ───────────────────────────────────────────────────
  const scrollToPage = useCallback((page: number) => {
    const el = pageEls.current.get(page);
    if (!el) return;
    // 标记 programmatic scroll，屏蔽 IO 期间的 onPageChange，防止父组件回写 currentPage 造成振荡
    progScrollTargetRef.current = page;
    if (progScrollTimerRef.current) clearTimeout(progScrollTimerRef.current);
    progScrollTimerRef.current = setTimeout(() => {
      progScrollTargetRef.current = 0;
      progScrollTimerRef.current = null;
    }, 700);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToIssue = useCallback(
    (issue: IssueLocation) => {
      if (!overlaySize || !pageBaseDims) {
        scrollToPage(issue.pageNumber);
        return;
      }

      const container = scrollRef.current;
      const pageEl = pageEls.current.get(issue.pageNumber);
      if (!container || !pageEl) {
        scrollToPage(issue.pageNumber);
        return;
      }

      const pageBlocks = blocksByPage.get(issue.pageNumber) ?? [];
      const box = boxForIssue(issue, pageBlocks);
      if (!box) {
        scrollToPage(issue.pageNumber);
        return;
      }

      // MinerU bbox 归一化到 0-1000
      const refW = 1000;
      const refH = 1000;
      const mapped = mapBoxToOverlay(box, refW, refH, overlaySize.w, overlaySize.h);

      // 目标：将 bbox 垂直居中到容器可视区域偏上（更符合阅读）
      const containerRect = container.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const currentScrollTop = container.scrollTop;

      // bbox 中心点相对 page wrapper 的 y 像素
      const targetYInPage = mapped.top + mapped.height / 2;
      // bbox 中心点相对容器顶部的距离（加上当前滚动）
      const targetYInContainer =
        currentScrollTop + (pageRect.top - containerRect.top) + targetYInPage;

      const desired =
        targetYInContainer - Math.max(24, container.clientHeight * 0.25);

      // 标记 programmatic scroll，屏蔽 IO 期间的 onPageChange
      progScrollTargetRef.current = issue.pageNumber;
      if (progScrollTimerRef.current) clearTimeout(progScrollTimerRef.current);
      progScrollTimerRef.current = setTimeout(() => {
        progScrollTargetRef.current = 0;
        progScrollTimerRef.current = null;
      }, 700);

      container.scrollTo({ top: Math.max(0, desired), behavior: "smooth" });
    },
    // scrollToPage 是稳定的；blocksByPage / highlightedIssues / overlaySize 等随状态变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocksByPage, highlightedIssues, overlaySize, pageBaseDims, scrollToPage]
  );

  const goPrev = () => {
    const next = Math.max(1, activePage - 1);
    scrollToPage(next);
    // activePage will update via IntersectionObserver
  };

  const goNext = () => {
    const next = numPages > 0 ? Math.min(numPages, activePage + 1) : activePage + 1;
    scrollToPage(next);
  };

  const commitPageInput = () => {
    const n = parseInt(pageInputValue, 10);
    if (!isNaN(n) && n >= 1 && n <= (numPages || Infinity)) {
      scrollToPage(n);
    }
    setPageInputFocused(false);
    setPageInputValue("");
  };

  // ─── External currentPage prop → scroll into view ─────────────────────────
  // 必须在 scrollToPage 声明之后
  useEffect(() => {
    if (currentPage == null || currentPage < 1) return;
    const target = numPages > 0 ? Math.min(numPages, currentPage) : currentPage;
    // 已经在目标页且无进行中的跳转，不重复滚动
    if (target === activePage && progScrollTargetRef.current === 0) return;
    if (pageEls.current.has(target)) {
      scrollToPage(target);
    } else {
      setActivePage(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, numPages, scrollToPage]);

  // ─── focusedIssue → scroll to exact bbox position ─────────────────────────
  useEffect(() => {
    if (!focusedIssue) return;
    if (!pdfReady || numPages <= 0) return;

    const target = Math.min(Math.max(1, focusedIssue.pageNumber), numPages);

    // 目标页未渲染：先导航到该页，等渲染后再定位
    if (!pageEls.current.has(target)) {
      scrollToPage(target);
      // 轮询等待页面渲染（最多等 3 秒）
      let attempts = 0;
      const maxAttempts = 30;
      const tryScroll = () => {
        attempts++;
        if (pageEls.current.has(target)) {
          requestAnimationFrame(() => {
            scrollToIssue({ ...focusedIssue, pageNumber: target });
          });
          const t = window.setTimeout(() => onFocusedIssueConsumed?.(), 800);
          return () => window.clearTimeout(t);
        }
        if (attempts < maxAttempts) {
          window.setTimeout(tryScroll, 100);
        } else {
          onFocusedIssueConsumed?.();
        }
      };
      const tid = window.setTimeout(tryScroll, 100);
      return () => window.clearTimeout(tid);
    }

    const raf = requestAnimationFrame(() => {
      scrollToIssue({ ...focusedIssue, pageNumber: target });
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [focusedIssue, pdfReady, numPages, scrollToIssue, scrollToPage]);

  function isFocused(issue: IssueLocation): boolean {
    if (!focusedIssue) return false;
    return (
      focusedIssue.pageNumber === issue.pageNumber &&
      focusedIssue.blockIndex === issue.blockIndex
    );
  }

  function isHovered(issue: IssueLocation): boolean {
    if (!hoveredIssue) return false;
    return (
      hoveredIssue.pageNumber === issue.pageNumber &&
      hoveredIssue.blockIndex === issue.blockIndex
    );
  }

  function renderPageOverlay(pageNum: number) {
    if (!overlaySize) return null;

    const issues = highlightsByPage.get(pageNum) ?? [];
    // 如果没有高亮问题，但本页有 focusedIssue，也要渲染
    const focusedOnThisPage =
      focusedIssue?.pageNumber === pageNum ? focusedIssue : null;
    const allIssues =
      focusedOnThisPage && !issues.includes(focusedOnThisPage)
        ? [...issues, focusedOnThisPage]
        : issues;

    if (allIssues.length === 0) return null;

    const pageBlocks = blocksByPage.get(pageNum) ?? [];
    const rW = overlaySize!.w;
    const rH = overlaySize!.h;
    // MinerU _build_bbox 将坐标归一化到 0-1000 范围
    const refW = 1000;
    const refH = 1000;

    return (
      <>
        {/* 视觉层：完全不接收事件 */}
        <div
          className="pointer-events-none absolute left-0 top-0 z-10"
          style={{ width: rW, height: rH }}
        >
          {allIssues.map((issue, idx) => {
            const box = boxForIssue(issue, pageBlocks);
            if (!box) return null;
            const { left, top, width, height } = mapBoxToOverlay(
              box,
              refW,
              refH,
              rW,
              rH,
              0
            );
            const focused = isFocused(issue);
            const hovered = !focused && isHovered(issue);
            const no = issueNoByKey?.[issueKey(issue)];
            return (
              <div
                key={`v-${pageNum}-${issue.blockIndex}-${idx}`}
                className={
                  focused
                    ? "pointer-events-none absolute rounded-sm border-2 border-orange-500 bg-orange-400/30 shadow-[0_0_0_2px_rgba(249,115,22,0.4)]"
                    : hovered
                      ? "pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/15 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]"
                      : "pointer-events-none absolute rounded-sm border-2 border-yellow-500 bg-yellow-300/20"
                }
                style={{ left, top, width, height }}
              >
                {no != null && (
                  <div className="absolute -left-2 -top-2 rounded-md border bg-background px-1 text-[10px] font-semibold text-foreground shadow-sm tabular-nums">
                    {no}
                  </div>
                )}
              </div>
            );
          })}

        </div>

        {/* Popover：点击提取项后的详情弹窗 — 放在 visual 层外，避免 pointer-events-none 拦截 */}
        {activePopover && focusedIssue && focusedIssue.pageNumber === pageNum && (() => {
          const popBox = boxForIssue(focusedIssue, pageBlocks);
          if (!popBox) return null;
          const pop = mapBoxToOverlay(popBox, refW, refH, rW, rH);
          const pTop = pop.top + pop.height + 6;
          const pLeft = Math.min(pop.left, rW - 280);
          return (
            <div
              className="pointer-events-auto absolute z-30 w-72 rounded-lg border border-orange-300 bg-white shadow-lg p-3 text-sm"
              style={{ left: pLeft, top: pTop }}
            >
              <button
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border bg-white text-xs text-muted-foreground shadow hover:bg-muted hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onDismissPopover?.(); }}
              >&#x2715;</button>
              <div className="font-semibold text-foreground mb-1">{activePopover.title}</div>
              <p className="text-xs text-muted-foreground leading-5">{activePopover.desc}</p>
              {activePopover.consequence && (
                <p className="mt-1 text-xs text-red-600">后果：{activePopover.consequence}</p>
              )}
              {activePopover.legalRef && (
                <p className="mt-1 text-xs text-muted-foreground">依据：{activePopover.legalRef}</p>
              )}
              <div className="mt-2 text-xs text-muted-foreground border-t pt-1">
                第{activePopover.page}页 #{activePopover.blockIdx}
              </div>
            </div>
          );
        })()}

        {/* 命中层：只负责 hover 联动，不影响视觉（透明） */}
        <div
          className="absolute left-0 top-0 z-20"
          style={{ width: rW, height: rH }}
        >
          {allIssues.map((issue, idx) => {
            const box = boxForIssue(issue, pageBlocks);
            if (!box) return null;
            const { left, top, width, height } = mapBoxToOverlay(
              box,
              refW,
              refH,
              rW,
              rH,
              0
            );
            return (
              <div
                key={`h-${pageNum}-${issue.blockIndex}-${idx}`}
                className="absolute"
                style={{ left, top, width, height }}
                onMouseEnter={() => onIssueHover?.(issue)}
                onMouseLeave={() => onIssueHover?.(null)}
                title="悬停查看对应问题"
              />
            );
          })}
        </div>
      </>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
          <p className="text-xs text-muted-foreground">
            请确认源文件为 PDF；若为扫描件，解析区块叠层可能仍依赖 MinerU 坐标。
          </p>
        </CardContent>
      </Card>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrev} disabled={activePage <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page number input */}
          <div className="flex items-center gap-1 text-sm">
            <span>第</span>
            {pageInputFocused ? (
              <input
                autoFocus
                type="number"
                min={1}
                max={numPages || undefined}
                value={pageInputValue}
                onChange={(e) => setPageInputValue(e.target.value)}
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitPageInput();
                  if (e.key === "Escape") { setPageInputFocused(false); setPageInputValue(""); }
                }}
                className="w-14 rounded border border-input bg-background px-1 py-0.5 text-center text-sm tabular-nums outline-none ring-1 ring-primary"
              />
            ) : (
              <button
                type="button"
                title="点击输入页码"
                className="min-w-[2.5rem] rounded px-1 py-0.5 text-center tabular-nums hover:bg-muted"
                onClick={() => {
                  setPageInputValue(String(activePage));
                  setPageInputFocused(true);
                }}
              >
                {activePage}
              </button>
            )}
            <span>/ {totalPagesLabel} 页</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={numPages === 0 || activePage >= numPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}
            disabled={zoom >= 2}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Scroll container ── */}
      <Card>
        <CardContent className="p-4">
          <div className="relative w-full min-w-0">
            {/* 量宽探针：不占高度，避免 PDF 区域纵向滚动条影响 clientWidth */}
            <div
              ref={widthProbeRef}
              className="pointer-events-none h-0 w-full min-w-0 overflow-hidden"
              aria-hidden
            />
            <div
              ref={scrollRef}
              className="relative overflow-y-auto rounded-lg bg-muted/20 [scrollbar-gutter:stable]"
              style={{ maxHeight: "80vh" }}
            >
              {/* Loading overlay（覆盖，但不隐藏 Document，否则永远不会触发 onLoadSuccess） */}
              {!pdfReady && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/30">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              <Document
                key={documentId}
                file={fileUrl}
                options={documentOptions}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
                className="flex flex-col items-center gap-4 py-4"
              >
                {numPages > 0 &&
                  Array.from({ length: numPages }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <div
                        key={pageNum}
                        ref={(el) => {
                          if (el) {
                            pageEls.current.set(pageNum, el);
                            pageDims.current.set(pageNum, { w: el.offsetWidth, h: el.offsetHeight });
                          } else {
                            pageEls.current.delete(pageNum);
                            pageDims.current.delete(pageNum);
                          }
                        }}
                        data-page={pageNum}
                        className="relative shrink-0 shadow-sm"
                      >
                        <Page
                          pageNumber={pageNum}
                          width={pageWidth}
                          renderTextLayer
                          renderAnnotationLayer={false}
                          // null loading keeps old canvas visible during zoom — no flash
                          loading={
                            overlaySize ? (
                              <div
                                style={{ width: overlaySize.w, height: overlaySize.h }}
                                className="bg-white"
                              />
                            ) : (
                              <div className="flex h-[520px] w-full items-center justify-center bg-white text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            )
                          }
                          onRenderSuccess={(p) => {
                            if (pageNum === 1) handlePage1RenderSuccess(p);
                            handlePageRenderSuccess(pageNum)(p);
                          }}
                        />
                        {overlaySize && renderPageOverlay(pageNum)}
                      </div>
                    );
                  })}
              </Document>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Current page issue list ── */}
      {(highlightsByPage.get(activePage)?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="mb-2 text-sm font-semibold text-yellow-800">
            当前页关联 {highlightsByPage.get(activePage)!.length} 条审查位置
          </p>
          <ul className="space-y-1">
            {highlightsByPage.get(activePage)!.map((issue, index) => (
              <li key={`${issue.blockIndex}-${index}`} className="text-sm text-yellow-800">
                {issue.textSnippet ? (
                  <span className="rounded bg-yellow-100 px-1 font-mono">
                    「{issue.textSnippet.substring(0, 80)}
                    {issue.textSnippet.length > 80 ? "…" : ""}」
                  </span>
                ) : (
                  <span className="text-muted-foreground">（无摘要）</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
