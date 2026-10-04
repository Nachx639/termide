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
} from "@opentui/core";
import { extend } from "@opentui/react";
import type { IBufferCell } from "@xterm/headless";
import type { TerminalSession } from "../lib/terminal/TerminalSession";
import { CURSOR_BG, CURSOR_FG, DEFAULT_BG, DEFAULT_FG, paletteColor, unpackRGB, type RGB } from "../lib/terminal/palette";

export interface TerminalViewOptions extends RenderableOptions<TerminalViewRenderable> {
  session?: TerminalSession | null;
  terminalFocused?: boolean;
  /** Called with the cell size layout gives the view (used to start the PTY at the right size). */
  onTerminalSize?: (cols: number, rows: number) => void;
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

  constructor(ctx: RenderContext, options: TerminalViewOptions) {
    super(ctx, { ...options, buffered: false });
    this.session = options.session ?? null;
    this._termFocused = options.terminalFocused ?? false;
    this.onTerminalSize = options.onTerminalSize ?? null;
  }

  get session() { return this._session; }
  set session(s: TerminalSession | null) {
    if (s === this._session) return;
    this.unsubscribe?.();
    this._session = s;
    this.unsubscribe = s ? s.onUpdate(() => this.requestRender()) : null;
    if (s && this.width > 0 && this.height > 0) s.resize(this.width, this.height);
    this.requestRender();
  }

  // Not `focused`: that name belongs to Renderable's own focus system.
  set terminalFocused(v: boolean) {
    if (v === this._termFocused) return;
    this._termFocused = v;
    this.requestRender();
  }
  get terminalFocused() { return this._termFocused; }

  protected override onResize(width: number, height: number): void {
    super.onResize(width, height);
    if (width > 0 && height > 0) {
      this._session?.resize(width, height);
      this.onTerminalSize?.(width, height);
    }
  }

  protected override onMouseEvent(event: MouseEvent): void {
    const s = this._session;
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

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const s = this._session;
    const w = this.width;
    const h = this.height;
    if (!s || w <= 0 || h <= 0) return;

    const buf = s.xterm.buffer.active;
    const top = s.viewportTop;
    const ox = this.screenX;
    const oy = this.screenY;
    const following = s.scrollOffset === 0;
    const showCursor = this._termFocused && following && !s.exited && (s.xterm as any)._core?.coreService?.isCursorHidden !== true;
    const cursorX = buf.cursorX;
    const cursorY = buf.cursorY;

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

        if (showCursor && row === cursorY && col === cursorX) {
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
