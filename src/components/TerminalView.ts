/**
 * TerminalView - native OpenTUI renderable that paints a TerminalSession's screen
 * straight into the frame buffer (no React element per row/segment), sizes the PTY
 * to exactly the space it gets from layout, and turns wheel events into scrollback
 * navigation or mouse/arrow input for full-screen programs.
 */
import {
  Renderable,
  RGBA,
  TextAttributes,
  type OptimizedBuffer,
  type RenderContext,
  type RenderableOptions,
  type MouseEvent,
  type Selection,
  convertGlobalToLocalSelection,
} from "@opentui/core";
import { extend } from "@opentui/react";
import type { IBufferCell } from "@xterm/headless";
import type { TerminalSession } from "../lib/terminal/TerminalSession";
import { pathRefAt, type PathRef } from "../lib/terminal/pathLinks";
import { CURSOR_BG, CURSOR_FG, DEFAULT_BG, DEFAULT_FG, paletteColor, unpackRGB, type RGB } from "../lib/terminal/palette";

export interface TerminalViewOptions extends RenderableOptions<TerminalViewRenderable> {
  session?: TerminalSession | null;
  terminalFocused?: boolean;
  /** Called with the cell size layout gives the view (used to start the PTY at the right size). */
  onTerminalSize?: (cols: number, rows: number) => void;
  /** Double-click on a file reference in the output ("src/a.ts:12"). */
  onOpenPath?: (ref: PathRef) => void;
  /** Search matches to highlight (buffer coordinates); `active` is the current one. */
  matches?: SearchMatch[];
}

export interface SearchMatch {
  line: number;
  col: number;
  len: number;
  active?: boolean;
}

const rgbaCache = new Map<number, RGBA>();
function rgba(c: RGB): RGBA {
  const key = (c[0] << 16) | (c[1] << 8) | c[2];
  let v = rgbaCache.get(key);
  if (!v) {
    if (rgbaCache.size > 4096) rgbaCache.clear();
    v = RGBA.fromInts(c[0], c[1], c[2], 255);
    rgbaCache.set(key, v);
  }
  return v;
}

const TRANSPARENT = RGBA.fromInts(0, 0, 0, 0);
const SELECTION_BG = RGBA.fromInts(38, 79, 120, 255);
const MATCH_BG = RGBA.fromInts(255, 255, 0, 255);
const MATCH_ACTIVE_BG = RGBA.fromInts(255, 140, 66, 255);
const SELECTION_FG = RGBA.fromInts(240, 242, 245, 255);

/** A point in buffer coordinates (absolute line incl. scrollback, column). */
interface BufPoint {
  line: number;
  col: number;
}
const FG_DEFAULT = rgba(DEFAULT_FG);
const BG_DEFAULT_SOLID = rgba(DEFAULT_BG);

function cellFg(cell: IBufferCell): RGBA | null {
  if (cell.isFgDefault()) return null;
  if (cell.isFgRGB()) return rgba(unpackRGB(cell.getFgColor()));
  return rgba(paletteColor(cell.getFgColor()));
}

function cellBg(cell: IBufferCell): RGBA | null {
  if (cell.isBgDefault()) return null;
  if (cell.isBgRGB()) return rgba(unpackRGB(cell.getBgColor()));
  return rgba(paletteColor(cell.getBgColor()));
}

function cellAttributes(cell: IBufferCell): number {
  let a = 0;
  if (cell.isBold()) a |= TextAttributes.BOLD;
  if (cell.isDim()) a |= TextAttributes.DIM;
  if (cell.isItalic()) a |= TextAttributes.ITALIC;
  if (cell.isUnderline()) a |= TextAttributes.UNDERLINE;
  if (cell.isBlink()) a |= TextAttributes.BLINK;
  if (cell.isStrikethrough()) a |= TextAttributes.STRIKETHROUGH;
  return a;
}

export class TerminalViewRenderable extends Renderable {
  private _session: TerminalSession | null = null;
  private _termFocused = false;
  private unsubscribe: (() => void) | null = null;
  private scratchCell: IBufferCell | undefined;
  onTerminalSize: ((cols: number, rows: number) => void) | null = null;
  onOpenPath: ((ref: PathRef) => void) | null = null;
  private _matches: SearchMatch[] = [];
  private dirty = true;
  private lastClick = { at: 0, x: -1, y: -1 };
  /** Mouse selection in buffer coordinates so it stays put while scrolling. */
  private selAnchor: BufPoint | null = null;
  private selFocus: BufPoint | null = null;

  constructor(ctx: RenderContext, options: TerminalViewOptions) {
    // Buffered: the view draws into its own frame buffer and only repaints when
    // something changed; other frames just blit it (natively). Repainting every
    // cell on every frame was ~10% of the app's CPU while you typed elsewhere.
    super(ctx, { ...options, buffered: true });
    this.selectable = true;
    this.session = options.session ?? null;
    this._termFocused = options.terminalFocused ?? false;
    this.onTerminalSize = options.onTerminalSize ?? null;
    this.onOpenPath = options.onOpenPath ?? null;
    this._matches = options.matches ?? [];
  }

  set matches(m: SearchMatch[] | undefined) {
    this._matches = m ?? [];
    this.repaint();
  }

  private repaint() {
    this.dirty = true;
    this.requestRender();
  }
  get matches() { return this._matches; }

  get session() { return this._session; }
  set session(s: TerminalSession | null) {
    if (s === this._session) return;
    this.unsubscribe?.();
    this._session = s;
    this.unsubscribe = s ? s.onUpdate(() => this.repaint()) : null;
    if (s && this.width > 0 && this.height > 0) s.resize(this.width, this.height);
    this.repaint();
  }

  // Not `focused`: that name belongs to Renderable's own focus system.
  set terminalFocused(v: boolean) {
    if (v === this._termFocused) return;
    this._termFocused = v;
    this.repaint();
  }
  get terminalFocused() { return this._termFocused; }

  protected override onResize(width: number, height: number): void {
    super.onResize(width, height);
    this.dirty = true;
    if (width > 0 && height > 0) {
      this._session?.resize(width, height);
      this.onTerminalSize?.(width, height);
    }
  }

  protected override onMouseEvent(event: MouseEvent): void {
    const s = this._session;
    if (s && event.type === "down" && event.button === 0) {
      this.handleClick(event.x - this.screenX, event.y - this.screenY);
      return;
    }
    if (!s || event.type !== "scroll" || !event.scroll) return;
    const dir = event.scroll.direction;
    if (dir !== "up" && dir !== "down") return;
    const lines = Math.max(1, event.scroll.delta || 1) * 3;
    if (s.mouseTracking) {
      // SGR wheel report to programs that track the mouse (vim, htop, lazygit...).
      const col = Math.max(1, event.x - this.screenX + 1);
      const row = Math.max(1, event.y - this.screenY + 1);
      s.write(`\x1b[<${dir === "up" ? 64 : 65};${col};${row}M`);
    } else if (s.isAlternateScreen) {
      // Full-screen app without mouse support: wheel acts like arrow keys (less, man).
      const key = s.applicationCursor ? (dir === "up" ? "\x1bOA" : "\x1bOB") : dir === "up" ? "\x1b[A" : "\x1b[B";
      s.write(key.repeat(lines));
    } else {
      s.scrollBy(dir === "up" ? lines : -lines);
    }
    event.stopPropagation();
  }

  /** Double-click on a file reference opens it. */
  private handleClick(col: number, row: number) {
    const s = this._session;
    if (!s) return;
    const now = Date.now();
    const isDouble = now - this.lastClick.at < 400 && this.lastClick.x === col && this.lastClick.y === row;
    this.lastClick = { at: isDouble ? 0 : now, x: col, y: row };
    if (!isDouble || !this.onOpenPath) return;
    const text = s.xterm.buffer.active.getLine(s.viewportTop + row)?.translateToString(true) ?? "";
    const ref = pathRefAt(text, col);
    if (ref) this.onOpenPath(ref);
  }

  override shouldStartSelection(x: number, y: number): boolean {
    if (!this.selectable || !this._session) return false;
    const lx = x - this.screenX;
    const ly = y - this.screenY;
    return lx >= 0 && lx < this.width && ly >= 0 && ly < this.height;
  }

  override onSelectionChanged(selection: Selection | null): boolean {
    const s = this._session;
    const local = convertGlobalToLocalSelection(selection, this.screenX, this.screenY);
    const had = this.selAnchor !== null;
    if (!s || !local?.isActive) {
      this.selAnchor = this.selFocus = null;
      if (had) this.repaint();
      return had;
    }
    const top = s.viewportTop;
    const clampCol = (c: number) => Math.max(0, Math.min(s.cols, c));
    const clampLine = (l: number) => Math.max(0, Math.min(s.xterm.buffer.active.length - 1, l));
    this.selAnchor = { line: clampLine(top + local.anchorY), col: clampCol(local.anchorX) };
    this.selFocus = { line: clampLine(top + local.focusY), col: clampCol(local.focusX) };
    this.repaint();
    return true;
  }

  override hasSelection(): boolean {
    return this.selAnchor !== null && this.selFocus !== null && (this.selAnchor.line !== this.selFocus.line || this.selAnchor.col !== this.selFocus.col);
  }

  /** Ordered selection range, end exclusive. */
  private selRange(): { start: BufPoint; end: BufPoint } | null {
    if (!this.hasSelection()) return null;
    const a = this.selAnchor!;
    const b = this.selFocus!;
    return a.line < b.line || (a.line === b.line && a.col <= b.col) ? { start: a, end: b } : { start: b, end: a };
  }

  private isSelected(line: number, col: number, range: { start: BufPoint; end: BufPoint } | null): boolean {
    if (!range) return false;
    const { start, end } = range;
    if (line < start.line || line > end.line) return false;
    if (line === start.line && col < start.col) return false;
    if (line === end.line && col >= end.col) return false;
    return true;
  }

  override getSelectedText(): string {
    const s = this._session;
    const range = this.selRange();
    if (!s || !range) return "";
    const buf = s.xterm.buffer.active;
    let out = "";
    for (let y = range.start.line; y <= range.end.line; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      const from = y === range.start.line ? range.start.col : 0;
      const to = y === range.end.line ? range.end.col : s.cols;
      const text = line.translateToString(y !== range.end.line, from, to);
      // Soft-wrapped continuation lines join without a newline.
      const next = buf.getLine(y + 1);
      out += text + (y < range.end.line && !next?.isWrapped ? "\n" : "");
    }
    return out.replace(/[ \t]+$/gm, "");
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const s = this._session;
    const w = this.width;
    const h = this.height;
    if (!s || w <= 0 || h <= 0) return;
    if (!this.dirty) return; // frame buffer still holds the last paint
    this.dirty = false;
    buffer.clear(TRANSPARENT);

    const buf = s.xterm.buffer.active;
    const top = s.viewportTop;
    // Drawing into our own frame buffer: local coordinates.
    const ox = 0;
    const oy = 0;
    const following = s.scrollOffset === 0;
    const showCursor = this._termFocused && following && !s.exited && (s.xterm as any)._core?.coreService?.isCursorHidden !== true;
    const cursorX = buf.cursorX;
    const cursorY = buf.cursorY;
    const range = this.selRange();
    // Search matches by line for the rows on screen.
    const matchesByLine = new Map<number, SearchMatch[]>();
    for (const m of this._matches) {
      if (m.line < top || m.line >= top + h) continue;
      const list = matchesByLine.get(m.line);
      if (list) list.push(m);
      else matchesByLine.set(m.line, [m]);
    }

    for (let row = 0; row < h; row++) {
      const line = row < s.rows ? buf.getLine(top + row) : undefined;
      if (!line) {
        buffer.fillRect(ox, oy + row, w, 1, TRANSPARENT);
        continue;
      }
      for (let col = 0; col < w; col++) {
        const cell = col < s.cols ? line.getCell(col, this.scratchCell) : undefined;
        if (!cell) {
          buffer.setCell(ox + col, oy + row, " ", FG_DEFAULT, TRANSPARENT, 0);
          continue;
        }
        this.scratchCell = cell;
        const width = cell.getWidth();
        if (width === 0) continue; // right half of a wide char, already painted

        let fg = cellFg(cell);
        let bg = cellBg(cell);
        if (cell.isInverse()) {
          const f = fg;
          fg = bg ?? BG_DEFAULT_SOLID;
          bg = f ?? FG_DEFAULT;
        }
        let attrs = cellAttributes(cell);
        if (cell.isInvisible()) fg = bg ?? TRANSPARENT;

        const hit = matchesByLine.get(top + row)?.find((m) => col >= m.col && col < m.col + m.len);
        if (hit) {
          fg = rgba(CURSOR_FG);
          bg = hit.active ? MATCH_ACTIVE_BG : MATCH_BG;
        } else if (range && this.isSelected(top + row, col, range)) {
          fg = SELECTION_FG;
          bg = SELECTION_BG;
        } else if (showCursor && row === cursorY && col === cursorX) {
          fg = rgba(CURSOR_FG);
          bg = rgba(CURSOR_BG);
        }

        const chars = cell.getChars() || " ";
        if (width === 2 || chars.length > 1) {
          buffer.drawText(chars, ox + col, oy + row, fg ?? FG_DEFAULT, bg ?? TRANSPARENT, attrs);
        } else {
          buffer.setCell(ox + col, oy + row, chars, fg ?? FG_DEFAULT, bg ?? TRANSPARENT, attrs);
        }
      }
    }

    // Scrollback indicator so it's obvious output is not live.
    if (!following) {
      const label = ` ↑ ${s.scrollOffset} lines · Shift+↓/wheel to return `;
      const x = ox + Math.max(0, w - label.length);
      buffer.drawText(label.slice(0, w), x, oy, rgba(CURSOR_FG), rgba(CURSOR_BG), TextAttributes.BOLD);
    }
  }

  protected override destroySelf(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.destroySelf();
  }
}

extend({ "terminal-view": TerminalViewRenderable });

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "terminal-view": typeof TerminalViewRenderable;
  }
}
