import { useCallback, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Drag-to-scroll for a horizontally scrollable element (ticket f24a1408: the
 * top bar's scrollbar is easy to miss with a mouse, so let people grab the bar
 * and pull it). A short drag never swallows the click, so links inside keep
 * working; a real drag suppresses the click that would otherwise follow a
 * pointerup on a link. Only mouse dragging is intercepted, so touch scrolling
 * and trackpad/wheel are left alone.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    suppressClick.current = false;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 5) return;
    d.moved = true;
    suppressClick.current = true;
    el.scrollLeft = d.left - dx;
    e.preventDefault();
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  }, []);

  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClickCapture,
    },
  };
}
