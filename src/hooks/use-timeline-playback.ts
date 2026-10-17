"use client";

import { useEffect, useRef, useState } from "react";

import type { TimelineWindow } from "@/domain/road-alerts/timeline";

/** A full replay of the window lasts ~9 s: long enough to watch alerts appear, short for a demo. */
const PLAYBACK_DURATION_MS = 9_000;
const PLAYBACK_TICK_MS = 60;

/** Animates the timeline cursor from its position (or the window start) to "now". */
export function useTimelinePlayback(window: TimelineWindow, cursorMs: number | null, setCursorMs: (ms: number | null) => void) {
  const [playing, setPlaying] = useState(false);
  const cursorRef = useRef(cursorMs);
  const windowRef = useRef(window);

  useEffect(() => {
    cursorRef.current = cursorMs;
    windowRef.current = window;
  });

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const { startMs, endMs } = windowRef.current;
      const stepMs = (endMs - startMs) / (PLAYBACK_DURATION_MS / PLAYBACK_TICK_MS);
      const next = (cursorRef.current ?? startMs) + stepMs;
      if (next >= endMs) {
        setCursorMs(null);
        setPlaying(false);
      } else {
        cursorRef.current = next;
        setCursorMs(next);
      }
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [playing, setCursorMs]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (cursorRef.current === null) {
      cursorRef.current = windowRef.current.startMs;
      setCursorMs(windowRef.current.startMs);
    }
    setPlaying(true);
  };

  return { playing, toggle, stop: () => setPlaying(false) };
}
