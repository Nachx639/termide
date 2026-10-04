import React, { useEffect, useState } from "react";
import { initialTermite, renderTermite, stepTermite, type TermiteState } from "../lib/termite";
import { Renderable, RGBA, parseColor, type OptimizedBuffer, type RenderContext, type RenderableOptions } from "@opentui/core";
import { extend } from "@opentui/react";

/**
 * The termite in the header (see lib/termite), plus the status-bar clock.
 *
 * Both used to be state in <App>, so every animation frame (300 ms) and every clock
 * tick re-rendered the whole IDE — ~5% CPU while idle. They now own their state and
 * only these tiny components re-render.
 */

const TICK_MS = 220;

/** Holds the termite simulation (lib/termite) and ticks only while it is shown. */
class MascotStore {
  private state: TermiteState = initialTermite();
  private width = 40;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  getState = () => this.state;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    if (this.listeners.size === 1) this.schedule();
    return () => {
      this.listeners.delete(l);
      if (this.listeners.size === 0) this.stop();
    };
  };

  setWidth(width: number) {
    this.width = width;
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.stop();
    if (this.state.mode === "gone" || this.listeners.size === 0) return;
    this.timer = setInterval(() => {
      this.state = stepTermite(this.state, this.width);
      if (this.state.mode === "gone") this.stop();
      this.emit();
    }, TICK_MS);
  }

  get alive() {
    return this.state.mode !== "poof" && this.state.mode !== "gone";
  }

  /** Toggle the mascot; returns true if it is now on. */
  toggle(): boolean {
    if (this.alive) {
      this.state = { ...this.state, mode: "poof", poof: 0 };
    } else {
      this.state = { ...initialTermite(), x: Math.max(0, Math.floor((this.width - 14) / 2)) };
    }
    this.emit();
    this.schedule();
    return this.alive;
  }
}

export const mascot = new MascotStore();

/**
 * One row of the termite scene, drawn natively: each tick repaints a few cells
 * instead of re-rendering React spans (that cost ~2% CPU at rest).
 */
class TermiteRowRenderable extends Renderable {
  private _line: 0 | 1 | 2 = 0;
  private _stripWidth = 40;
  private unsubscribe: (() => void) | null;
  private colors = new Map<string, RGBA>();

  constructor(ctx: RenderContext, options: RenderableOptions<TermiteRowRenderable> & { line?: 0 | 1 | 2; stripWidth?: number }) {
    super(ctx, { ...options, height: 1 });
    this._line = options.line ?? 0;
    this._stripWidth = options.stripWidth ?? 40;
    this.unsubscribe = mascot.subscribe(() => this.requestRender());
  }

  set line(v: 0 | 1 | 2) {
    this._line = v;
    this.requestRender();
  }
  set stripWidth(v: number) {
    this._stripWidth = v;
    mascot.setWidth(v);
    this.requestRender();
  }

  private color(hex: string): RGBA {
    let c = this.colors.get(hex);
    if (!c) {
      c = parseColor(hex);
      this.colors.set(hex, c);
    }
    return c;
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const row = renderTermite(mascot.getState(), Math.min(this._stripWidth, this.width))[this._line] ?? [];
    for (let i = 0; i < row.length; i++) {
      const cell = row[i]!;
      if (cell.ch !== " ") buffer.setCell(this.screenX + i, this.screenY, cell.ch, this.color(cell.fg), TRANSPARENT, 0);
    }
  }

  protected override destroySelf(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.destroySelf();
  }
}

const TRANSPARENT = RGBA.fromInts(0, 0, 0, 0);

extend({ "termite-row": TermiteRowRenderable });

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "termite-row": typeof TermiteRowRenderable;
  }
}

/** One row of the termite scene, walking within `width` columns. */
export function MascotLine({ line, width }: { line: 0 | 1 | 2; width: number }) {
  useEffect(() => mascot.setWidth(width), [width]);
  return <termite-row line={line} stripWidth={width} style={{ flexGrow: 1, height: 1 }} />;
}

/** HH:MM, refreshed on minute boundaries instead of every second. */
export function Clock(props: { style?: Record<string, unknown> }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, []);
  return <text style={props.style as any}>{now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}</text>;
}
