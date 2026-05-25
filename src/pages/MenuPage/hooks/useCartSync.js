import { useCallback, useRef } from "react";

/**
 * Debounced flush for high-frequency cart persistence (scoped cart writes).
 * Call `schedule(cartObject)` from handlers; `flush()` on blur/navigation if needed.
 */
export function useDebouncedScopedCartWrite(writeFn, delayMs = 220) {
  const timerRef = useRef(null);
  const pendingRef = useRef(null);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== null) {
      const payload = pendingRef.current;
      pendingRef.current = null;
      writeFn(payload);
    }
  }, [writeFn]);

  const schedule = useCallback(
    (payload) => {
      pendingRef.current = payload;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, delayMs);
    },
    [delayMs, flush],
  );

  return { schedule, flush };
}
