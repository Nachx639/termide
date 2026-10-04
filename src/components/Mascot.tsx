import React, { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The walking ant in the header, plus the status-bar clock.
 *
 * Both used to be state in <App>, so every animation frame (300 ms) and every clock
 * tick re-rendered the whole IDE — ~5% CPU while idle. They now own their state and
 * only these tiny components re-render.
 */

type AntStatus = "walking" | "dying" | "dead";

const WALK_FRAMES = [
  ["      \\ \\", " ooO( o.o )>", "  / / / /"],
  ["      / /", " ooO( o.o )>", "  \\ \\ \\ \\"],
];

const DEATH_FRAMES = [
  ["      * *", "  o O ( x.x )", "    * * * *"],
  ["       . .", "    . ( x-x ) .", "       . ."],
  ["        *", "      . * .", "        *"],
  ["         .", "       . .", "         ."],
  ["", "        .", ""],
  ["", "", ""],
];

const ANT_WIDTH = 12;

class MascotStore {
  private state = { status: "walking" as AntStatus, frame: 0, death: 0 };
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

  private set(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.stop();
    if (this.state.status === "dead" || this.listeners.size === 0) return;
    const dying = this.state.status === "dying";
    this.timer = setInterval(() => {
      if (this.state.status === "walking") {
        this.set({ frame: (this.state.frame + 1) % 4000 });
      } else if (this.state.status === "dying") {
        if (this.state.death >= DEATH_FRAMES.length - 1) {
          this.set({ status: "dead" });
          this.stop();
        } else {
          this.set({ death: this.state.death + 1 });
        }
      }
    }, dying ? 150 : 300);
  }

  get alive() {
    return this.state.status === "walking";
  }

  /** Toggle the mascot; returns true if it is now on. */
  toggle(): boolean {
    if (this.state.status === "walking") this.set({ status: "dying", death: 0 });
    else this.set({ status: "walking" });
    this.schedule();
    return this.state.status === "walking";
  }
}

export const mascot = new MascotStore();

/** One of the three lines of the ant, walking within `width` columns. */
export function MascotLine({ line, width }: { line: 0 | 1 | 2; width: number }) {
  const { status, frame, death } = useSyncExternalStore(mascot.subscribe, mascot.getState);
  if (status === "dead") return <text> </text>;
  const walkSpace = Math.max(0, width - ANT_WIDTH);
  if (walkSpace <= 0) return <text> </text>;
  const pos = frame % (walkSpace + 1);
  const frames = status === "dying" ? DEATH_FRAMES[death] ?? DEATH_FRAMES[DEATH_FRAMES.length - 1]! : WALK_FRAMES[frame % 2]!;
  return <text style={{ fg: "cyan" }}>{" ".repeat(pos) + (frames[line] ?? "")}</text>;
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
