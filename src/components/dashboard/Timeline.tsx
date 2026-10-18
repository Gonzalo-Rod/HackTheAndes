"use client";

import { useRef, useState } from "react";

import { STATUS_META, STATUS_PRIORITY } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { RoadAlert } from "@/contracts/road-alerts";
import { eventTimeMs, type TimelineRange, type TimelineWindow } from "@/domain/road-alerts/timeline";
import { useElementSize } from "@/hooks/use-element-size";
import { formatShortDate } from "@/lib/format";
import { DAY_MS } from "@/lib/time";

const RANGES: { value: TimelineRange; label: string }[] = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "todo", label: "Todo" },
];
const MIN_TICK_SPACING_PX = 56;
const STACK_STEP_PX = 9;

interface TimelineProps {
  alerts: RoadAlert[];
  window: TimelineWindow;
  range: TimelineRange;
  cursorMs: number | null;
  playing: boolean;
  earlierCount: number;
  selectedId: string | null;
  onRangeChange: (range: TimelineRange) => void;
  onCursorChange: (ms: number | null) => void;
  onTogglePlay: () => void;
  onStep: (direction: -1 | 1) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function Timeline(props: TimelineProps) {
  const { alerts, window, range, cursorMs, playing, earlierCount, selectedId } = props;
  const [trackRef, size] = useElementSize<HTMLDivElement>();
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const span = Math.max(1, window.endMs - window.startMs);
  const pos = (ms: number) => ((ms - window.startMs) / span) * size.width;
  const cursor = cursorMs ?? window.endMs;
  const isLive = cursorMs === null;

  const days = Math.ceil(span / DAY_MS);
  const tickEvery = Math.max(1, Math.ceil(days / Math.max(1, size.width / MIN_TICK_SPACING_PX)));
  const ticks: number[] = [];
  for (let i = 0; i <= days; i += tickEvery) {
    const t = window.startMs + i * DAY_MS;
    if (t <= window.endMs) ticks.push(t);
  }

  // Stack alerts that share an event day, most severe at the bottom.
  const stacks = new Map<number, RoadAlert[]>();
  for (const alert of alerts) {
    const t = eventTimeMs(alert);
    if (t === null || t < window.startMs) continue;
    stacks.set(t, [...(stacks.get(t) ?? []), alert]);
  }

  const msFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return window.endMs;
    return window.startMs + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * span;
  };
  const setFromClientX = (clientX: number) => {
    const ms = msFromClientX(clientX);
    props.onCursorChange(ms >= window.endMs - span * 0.01 ? null : ms);
  };

  return (
    <section className="pr-timeline" aria-label="Línea de tiempo">
      <div className="pr-timeline__bar">
        <h2 className="pr-dock-title">Línea de tiempo</h2>
        <div className="pr-timeline__controls">
          <button
            type="button"
            className="pr-icon-btn"
            onClick={() => props.onStep(-1)}
            aria-label="Evento anterior"
            title="Evento anterior"
          >
            <Icon name="prev" size={13} />
          </button>
          <button
            type="button"
            className="pr-icon-btn pr-icon-btn--primary"
            onClick={props.onTogglePlay}
            aria-label={playing ? "Pausar" : "Reproducir"}
            title={playing ? "Pausar" : "Reproducir"}
          >
            <Icon name={playing ? "pause" : "play"} size={13} />
          </button>
          <button
            type="button"
            className="pr-icon-btn"
            onClick={() => props.onStep(1)}
            aria-label="Evento siguiente"
            title="Evento siguiente"
          >
            <Icon name="next" size={13} />
          </button>
        </div>
        <div className="pr-segmented pr-segmented--sm" role="group" aria-label="Periodo">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              className="pr-segmented__item"
              aria-pressed={range === r.value}
              onClick={() => props.onRangeChange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="pr-timeline__status">
          {isLive ? "Mostrando todas las alertas vigentes" : `Alertas con evento hasta el ${formatShortDate(cursor)}`}
          {!isLive && (
            <button type="button" className="pr-btn pr-btn--link" onClick={() => props.onCursorChange(null)}>
              Volver a hoy
            </button>
          )}
        </span>
      </div>

      <div className="pr-timeline__trackwrap">
        {earlierCount > 0 && (
          <span className="pr-timeline__earlier" title="Alertas con fecha de evento anterior al periodo">
            ◂ {earlierCount} antes
          </span>
        )}
        <div
          ref={trackRef}
          className={`pr-timeline__track${dragging ? " is-dragging" : ""}`}
          role="slider"
          tabIndex={0}
          aria-label="Fecha del evento"
          aria-valuemin={window.startMs}
          aria-valuemax={window.endMs}
          aria-valuenow={cursor}
          aria-valuetext={isLive ? "Hoy" : formatShortDate(cursor)}
          onPointerDown={(event) => {
            draggingRef.current = true;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            setFromClientX(event.clientX);
          }}
          onPointerMove={(event) => {
            if (draggingRef.current) setFromClientX(event.clientX);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
            setDragging(false);
          }}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" ? DAY_MS : event.key === "ArrowLeft" ? -DAY_MS : 0;
            if (event.key === "Home") props.onCursorChange(window.startMs);
            else if (event.key === "End") props.onCursorChange(null);
            else if (step) {
              const next = Math.max(window.startMs, cursor + step);
              props.onCursorChange(next >= window.endMs ? null : next);
            } else return;
            event.preventDefault();
          }}
        >
          <div className="pr-timeline__rail" />
          <div className="pr-timeline__played" style={{ width: pos(cursor) }} />
          {ticks.map((t) => (
            <span key={t} className="pr-timeline__tick" style={{ left: pos(t) }}>
              <span>{formatShortDate(t + DAY_MS / 2)}</span>
            </span>
          ))}
          {[...stacks.entries()].flatMap(([t, group]) =>
            [...group]
              .sort((a, b) => STATUS_PRIORITY[b.roadStatus] - STATUS_PRIORITY[a.roadStatus])
              .map((alert, index) => (
                <button
                  key={alert.id}
                  type="button"
                  className={`pr-timeline__event${alert.id === selectedId ? " is-selected" : ""}${t > cursor ? " is-future" : ""}`}
                  style={{ left: pos(t), bottom: 22 + index * STACK_STEP_PX, background: STATUS_META[alert.roadStatus].color }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => props.onSelect(alert.id)}
                  onMouseEnter={() => props.onHover(alert.id)}
                  onMouseLeave={() => props.onHover(null)}
                  aria-label={`${formatShortDate(t)}: ${STATUS_META[alert.roadStatus].label}, ${alert.title}`}
                  title={`${formatShortDate(t)} · ${alert.roadCode} ${alert.kmText}`}
                />
              )),
          )}
          <div className="pr-timeline__cursor" style={{ left: pos(cursor) }}>
            <span className="pr-timeline__cursor-label">{isLive ? "Hoy" : formatShortDate(cursor)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
