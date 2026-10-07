import { useEffect } from 'react';
import { analyticsView, analyticsLeave } from '#api';

/**
 * Sends a page-view beacon per route change so the admin Logs view can trace
 * how long people actually spend on each page. Each path gets a fresh viewId;
 * the leave signal stamps the duration onto that row, and the pagehide +
 * visibility handlers cover closing the tab and switching away from it.
 */
export function usePageView(path: string) {
  useEffect(() => {
    const viewId = crypto.randomUUID();
    let closed = false;
    analyticsView({ viewId, path, referer: document.referrer }).catch(() => {});
    const leave = () => {
      if (closed) return;
      closed = true;
      void analyticsLeave({ viewId, path });
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', onVis);
      leave();
    };
  }, [path]);
}