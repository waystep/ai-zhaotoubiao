import { useEffect, useMemo } from "react";

const STORAGE_PREFIX = "dashboardScroll:";

export function useDashboardScrollRestoration(key: string) {
  const storageKey = useMemo(() => `${STORAGE_PREFIX}${key}`, [key]);

  useEffect(() => {
    const el = document.getElementById("dashboard-scroll");
    if (!el) return;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    // 等一帧，确保列表渲染完成后再滚动
    requestAnimationFrame(() => {
      el.scrollTo({ top: n });
    });
  }, [storageKey]);

  const saveNow = () => {
    const el = document.getElementById("dashboard-scroll");
    if (!el) return;
    sessionStorage.setItem(storageKey, String(el.scrollTop));
  };

  return { saveNow };
}

