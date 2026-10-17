"use client";

import { useEffect, useState } from "react";

/** Relative times ("hace 3 min") only need minute precision. */
const NOW_TICK_MS = 30_000;

/** Current time, refreshed periodically. Null until mounted, so server and client render the same markup. */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  return now;
}
