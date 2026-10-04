/**
 * The termite mascot: sprite drawing and a small behaviour simulation, kept free
 * of React so it can be tested. The header renders three rows of cells from
 * `renderTermite`.
 *
 * Behaviours: walks back and forth (turning at the edges, sprite mirrored),
 * legs alternate over four frames, antennae twitch, it blinks, sometimes stops
 * to sniff, sometimes gnaws wood (chomping, crumbs fly) and then carries a
 * splinter for a while. Toggling it off plays a little "poof".
 */

export type Dir = 1 | -1;
export type Mode = "walk" | "sniff" | "munch" | "turn" | "poof" | "gone";

export interface Crumb {
  x: number;
  row: number;
  ttl: number;
}

export interface TermiteState {
  x: number;
  dir: Dir;
  mode: Mode;
  /** Ticks left in the current non-walking mode. */
  modeTicks: number;
  tick: number;
  carrying: number; // ticks left carrying a splinter
  blink: boolean;
  crumbs: Crumb[];
  poof: number;
}

export interface Cell {
  ch: string;
  fg: string;
}

const C = {
  belly1: "#f3e3bd", // pale cream abdomen (termites are light)
  belly2: "#e2c48a",
  belly3: "#c9a063",
  head: "#c2551a",
  eye: "#1a1a1a",
  eyeShine: "#fff7e0",
  jaw: "#7c2d12",
  leg: "#9a6a3a",
  antenna: "#b45309",
  wood: "#a16207",
  crumb: "#ca8a04",
  poof: "#d6d3d1",
};

/** Sprite width in cells (right-facing layout below). */
export const TERMITE_WIDTH = 14;

type Seg = [string, string]; // [text, colour]

/**
 * Right-facing sprite, three rows of segments. Columns:
 *   0         1
 *   01234567890123
 *           ╲ ╱        antennae (twitch)
 *    ░▒▓▓▓▒▒(◕)>       abdomen · head · mandibles
 *     ╱╲╱╲╱╲           legs (alternate)
 */
function spriteRight(s: TermiteState, legPhase: number, antennaPhase: number, chomp: boolean): Seg[][] {
  const antennae = [
    ["╲ ╱", "╲ │"],
    ["│ ╱", "╲ ╱"],
  ][antennaPhase % 2]![Math.floor(s.tick / 3) % 2]!;
  const eye = s.blink ? "-" : "◕";
  const jaw = chomp ? "=" : ">";
  const legs = ["╱╲╱╲╱╲", "╲╱╲╱╲╱", "│╲│╲│╲", "╱│╱│╱│"][legPhase % 4]!;
  const carry = s.carrying > 0 ? ([["▬", C.wood]] as Seg[]) : ([[" ", C.wood]] as Seg[]);
  return [
    [["        ", C.antenna], [antennae, C.antenna]], // over the head "(◕)"
    [
      [" ", C.belly1],
      ["░", C.belly1],
      ["▒", C.belly1],
      ["▓▓", C.belly2],
      ["▓", C.belly3],
      ["▒▒", C.belly2],
      ["(", C.head],
      [eye, s.blink ? C.head : C.eye],
      [")", C.head],
      [jaw, C.jaw],
      ...carry,
    ],
    [["  ", C.leg], [legs, C.leg], ["      ", C.leg]],
  ];
}

const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  ">": "<",
  "<": ">",
  "╱": "╲",
  "╲": "╱",
  "◖": "◗",
  "◗": "◖",
};

function rowToCells(row: Seg[]): Cell[] {
  const out: Cell[] = [];
  for (const [text, fg] of row) for (const ch of text) out.push({ ch, fg });
  // Every row is exactly TERMITE_WIDTH so mirrored rows stay aligned.
  while (out.length < TERMITE_WIDTH) out.push({ ch: " ", fg: C.belly1 });
  return out.slice(0, TERMITE_WIDTH);
}

/** The three sprite rows as cells, facing `s.dir` (left = mirrored cell by cell). */
export function termiteSprite(s: TermiteState): Cell[][] {
  const walking = s.mode === "walk";
  const legPhase = walking ? s.tick : 0;
  const antennaPhase = s.mode === "sniff" ? s.tick : 0;
  const chomp = s.mode === "munch" && s.tick % 2 === 0;
  const rows = spriteRight(s, legPhase, antennaPhase, chomp).map(rowToCells);
  if (s.dir === 1) return rows;
  return rows.map((row) => row.slice().reverse().map((c) => ({ ch: MIRROR[c.ch] ?? c.ch, fg: c.fg })));
}

const POOF = [
  ["    *  *  *   ", "  * (x_x) *   ", "    *  *  *   "],
  ["     .  .     ", "   . ( * ) .  ", "     .  .     "],
  ["      .       ", "    .  *  .   ", "      .       "],
  ["              ", "      .       ", "              "],
];

/**
 * Render the scene for a header strip of `width` columns: three rows of cells
 * (unset cells are spaces).
 */
export function renderTermite(s: TermiteState, width: number): Cell[][] {
  const rows: Cell[][] = [0, 1, 2].map(() => Array.from({ length: Math.max(0, width) }, () => ({ ch: " ", fg: C.poof })));
  if (s.mode === "gone" || width < TERMITE_WIDTH) return rows;
  const put = (row: number, col: number, cell: Cell) => {
    if (col >= 0 && col < width && cell.ch !== " ") rows[row]![col] = cell;
  };
  if (s.mode === "poof") {
    const frame = POOF[Math.min(POOF.length - 1, s.poof)]!;
    frame.forEach((line, r) => [...line].forEach((ch, i) => put(r, s.x + i, { ch, fg: C.poof })));
    return rows;
  }
  termiteSprite(s).forEach((row, r) => row.forEach((cell, i) => put(r, s.x + i, cell)));
  for (const c of s.crumbs) put(c.row, c.x, { ch: c.ttl > 2 ? "∙" : "·", fg: C.crumb });
  return rows;
}

export function initialTermite(): TermiteState {
  return { x: 0, dir: 1, mode: "walk", modeTicks: 0, tick: 0, carrying: 0, blink: false, crumbs: [], poof: 0 };
}

/** Advance the simulation one tick inside a strip `width` columns wide. */
export function stepTermite(prev: TermiteState, width: number, rand: () => number = Math.random): TermiteState {
  const s: TermiteState = { ...prev, tick: prev.tick + 1, crumbs: [] };
  const maxX = Math.max(0, width - TERMITE_WIDTH);

  // Crumbs drift down and fade.
  for (const c of prev.crumbs) {
    if (c.ttl <= 1) continue;
    s.crumbs.push({ x: c.x, row: Math.min(2, c.row + (rand() < 0.5 ? 1 : 0)), ttl: c.ttl - 1 });
  }

  if (s.mode === "gone") return s;
  if (s.mode === "poof") {
    s.poof = prev.poof + 1;
    if (s.poof >= POOF.length) s.mode = "gone";
    return s;
  }

  s.blink = rand() < 0.04;
  if (s.carrying > 0) s.carrying--;
  s.x = Math.min(s.x, maxX);

  if (s.mode !== "walk") {
    s.modeTicks = prev.modeTicks - 1;
    if (s.mode === "munch") {
      // Splinters fly from the jaws.
      const jawX = s.dir === 1 ? s.x + TERMITE_WIDTH - 2 : s.x + 1;
      if (rand() < 0.7) s.crumbs.push({ x: jawX + (s.dir === 1 ? 1 : -1) * (1 + Math.floor(rand() * 2)), row: 1, ttl: 4 });
    }
    if (s.modeTicks <= 0) {
      if (s.mode === "turn") s.dir = (s.dir === 1 ? -1 : 1) as Dir;
      if (s.mode === "munch") s.carrying = 25 + Math.floor(rand() * 20);
      s.mode = "walk";
    }
    return s;
  }

  // Walking: turn at the edges, sometimes stop to sniff or gnaw.
  const next = s.x + s.dir;
  if (next < 0 || next > maxX) {
    s.mode = "turn";
    s.modeTicks = 2;
    return s;
  }
  s.x = next;
  const r = rand();
  if (r < 0.025) {
    s.mode = "sniff";
    s.modeTicks = 6 + Math.floor(rand() * 8);
  } else if (r < 0.04 && s.carrying === 0) {
    s.mode = "munch";
    s.modeTicks = 8 + Math.floor(rand() * 6);
  } else if (r < 0.05) {
    s.mode = "turn";
    s.modeTicks = 2;
  }
  return s;
}
