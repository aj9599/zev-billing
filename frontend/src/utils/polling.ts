/**
 * pollWhileVisible runs `fn` every `intervalMs`, but skips ticks while the
 * browser tab is hidden — so we don't keep polling the backend for a page
 * nobody is looking at (a real saving on the Raspberry Pi target). When the tab
 * becomes visible again it fires `fn` once immediately so the data isn't stale.
 *
 * Returns a cleanup function that clears the timer and the visibility listener;
 * call it from a useEffect cleanup.
 */
export function pollWhileVisible(fn: () => void, intervalMs: number): () => void {
  const interval = setInterval(() => {
    if (!document.hidden) fn();
  }, intervalMs);
  const onVisible = () => {
    if (!document.hidden) fn();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
