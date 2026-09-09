import { useEffect, useRef } from "react";

/** Keep keyboard navigation in an open dialog, then return to its invoking control. */
export function useDialogFocus<T extends HTMLElement>(active: boolean, restoreTarget?: HTMLElement | null) {
  const dialog = useRef<T>(null);
  const previous = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);
  if (active && !wasActive.current && typeof document !== "undefined") {
    previous.current = restoreTarget ?? document.activeElement as HTMLElement | null;
  }
  wasActive.current = active;
  useEffect(() => {
    const root = dialog.current;
    if (!active || !root) return;
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[inert], [hidden]'));
    const focusFirst = () => (focusable()[0] ?? root).focus();
    const onFocus = (event: FocusEvent) => { if (!root.contains(event.target as Node)) focusFirst(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const targets = focusable();
      const first = targets[0]; const last = targets.at(-1);
      if (!first || !last) { event.preventDefault(); root.focus(); return; }
      const current = document.activeElement;
      if (!root.contains(current) || (event.shiftKey && current === first) || (!event.shiftKey && current === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    };
    if (!root.contains(document.activeElement)) focusFirst();
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, [active]);
  return dialog;
}
