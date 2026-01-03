/**
 * VirtualTerminal - A terminal emulator that parses ANSI sequences
 * and maintains a virtual screen buffer that can be rendered by OpenTUI
 */

export interface CellStyle {
  fg: string;
  bg: string;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  hidden?: boolean;
}

export interface Cell {
  char: string;
  style: CellStyle;
}

export interface CursorPosition {
  row: number;
  col: number;
}

const DEFAULT_STYLE: CellStyle = {
  fg: "white",
  bg: "transparent",
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
};

// ANSI color codes - magenta remapped to cyan for visual harmony
const COLORS_16 = [
  "black", "red", "green", "yellow", "blue", "cyan", "cyan", "white",
  "gray", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightCyan", "brightCyan", "brightWhite"
];

export class VirtualTerminal {
  private rows: number;
  private cols: number;
  private buffer: Cell[][];
  private cursor: CursorPosition;
  private savedCursor: CursorPosition | null = null;
  private currentStyle: CellStyle;
  private scrollTop: number = 0;
  private scrollBottom: number;
  private alternateBuffer: Cell[][] | null = null;
  private useAlternateBuffer: boolean = false;
  private parseBuffer: string = "";
  public cursorVisible: boolean = true;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.scrollBottom = rows - 1;
    this.buffer = this.createEmptyBuffer();
    this.cursor = { row: 0, col: 0 };
    this.currentStyle = { ...DEFAULT_STYLE };
    this.cursorVisible = true;
  }

  private createEmptyBuffer(): Cell[][] {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => ({
        char: " ",
        style: { ...DEFAULT_STYLE },
      }))
    );
  }

  resize(rows: number, cols: number) {
    const newBuffer = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        if (r < this.rows && c < this.cols && this.buffer[r]) {
          return this.buffer[r][c];
        }
        return { char: " ", style: { ...DEFAULT_STYLE } };
      })
    );
    this.rows = rows;
    this.cols = cols;
    this.scrollBottom = rows - 1;
    this.buffer = newBuffer as Cell[][];
    this.cursor.row = Math.min(this.cursor.row, rows - 1);
    this.cursor.col = Math.min(this.cursor.col, cols - 1);
  }

  write(data: string) {
    this.parseBuffer += data;
    this.parse();
  }

  private parse() {
    let i = 0;
    const data = this.parseBuffer;

    while (i < data.length) {
      const char = data[i];

      if (char === "\x1b") {
        // ESC sequence
        if (i + 1 >= data.length) {
          // Need more data
          this.parseBuffer = data.slice(i);
          return;
        }

        const next = data[i + 1];

        if (next === "[") {
          // CSI sequence
          const match = data.slice(i).match(/^\x1b\[([0-9;?]*)([A-Za-z@`])/);
          if (!match) {
            if (data.length - i < 20) {
              // Might be incomplete
              this.parseBuffer = data.slice(i);
              return;
            }
            i++;
            continue;
          }
          const [full, params, command] = match;
          this.handleCSI(params, command);
          i += full.length;
        } else if (next === "]") {
          // OSC sequence (Operating System Command)
          const end = data.indexOf("\x07", i);
          const stEnd = data.indexOf("\x1b\\", i);
          if (end === -1 && stEnd === -1) {
            this.parseBuffer = data.slice(i);
            return;
          }
          const endPos = end !== -1 && (stEnd === -1 || end < stEnd) ? end + 1 : (stEnd !== -1 ? stEnd + 2 : i + 2);
          // Just skip OSC sequences for now
          i = endPos;
        } else if (next === "(") {
          // Character set designation, skip
          i += 3;
        } else if (next === ")") {
          i += 3;
        } else if (next === "=") {
          // Application keypad mode
          i += 2;
        } else if (next === ">") {
          // Normal keypad mode
          i += 2;
        } else if (next === "7") {
          // Save cursor
          this.savedCursor = { ...this.cursor };
          i += 2;
        } else if (next === "8") {
          // Restore cursor
          if (this.savedCursor) {
            this.cursor = { ...this.savedCursor };
          }
          i += 2;
        } else if (next === "M") {
          // Reverse index
          this.reverseIndex();
          i += 2;
        } else if (next === "D") {
          // Index (move down)
          this.index();
          i += 2;
        } else if (next === "c") {
          // Full reset
          this.reset();
          i += 2;
        } else {
          i++;
        }
      } else if (char === "\r") {
        this.cursor.col = 0;
        i++;
      } else if (char === "\n") {
        this.lineFeed();
        i++;
      } else if (char === "\t") {
        this.cursor.col = Math.min(this.cols - 1, (Math.floor(this.cursor.col / 8) + 1) * 8);
        i++;
      } else if (char === "\b") {
        if (this.cursor.col > 0) this.cursor.col--;
        i++;
      } else if (char === "\x07") {
        // Bell, ignore
        i++;
      } else if (char.charCodeAt(0) < 32) {
        // Other control characters, skip
        i++;
      } else {
        // Regular character
        this.putChar(char);
        i++;
      }
    }

    this.parseBuffer = "";
  }

  private handleCSI(params: string, command: string) {
    const args = params ? params.split(";").map((p) => parseInt(p, 10) || 0) : [];

    switch (command) {
      case "A": // Cursor up
        this.cursor.row = Math.max(0, this.cursor.row - (args[0] || 1));
        break;
      case "B": // Cursor down
        this.cursor.row = Math.min(this.rows - 1, this.cursor.row + (args[0] || 1));
        break;
      case "C": // Cursor forward
        this.cursor.col = Math.min(this.cols - 1, this.cursor.col + (args[0] || 1));
        break;
      case "D": // Cursor back
        this.cursor.col = Math.max(0, this.cursor.col - (args[0] || 1));
        break;
      case "E": // Cursor next line
        this.cursor.col = 0;
        this.cursor.row = Math.min(this.rows - 1, this.cursor.row + (args[0] || 1));
        break;
      case "F": // Cursor previous line
        this.cursor.col = 0;
        this.cursor.row = Math.max(0, this.cursor.row - (args[0] || 1));
        break;
      case "G": // Cursor horizontal absolute
        this.cursor.col = Math.min(this.cols - 1, Math.max(0, (args[0] || 1) - 1));
        break;
      case "H": // Cursor position
      case "f":
        this.cursor.row = Math.min(this.rows - 1, Math.max(0, (args[0] || 1) - 1));
        this.cursor.col = Math.min(this.cols - 1, Math.max(0, (args[1] || 1) - 1));
        break;
      case "J": // Erase in display
        this.eraseInDisplay(args[0] || 0);
        break;
      case "K": // Erase in line
        this.eraseInLine(args[0] || 0);
        break;
      case "L": // Insert lines
        this.insertLines(args[0] || 1);
        break;
      case "M": // Delete lines
        this.deleteLines(args[0] || 1);
        break;
      case "P": // Delete characters
        this.deleteChars(args[0] || 1);
        break;
      case "@": // Insert characters
        this.insertChars(args[0] || 1);
        break;
      case "S": // Scroll up
        this.scrollUp(args[0] || 1);
        break;
      case "T": // Scroll down
        this.scrollDown(args[0] || 1);
        break;
      case "X": // Erase characters
        this.eraseChars(args[0] || 1);
        break;
      case "d": // Vertical position absolute
        this.cursor.row = Math.min(this.rows - 1, Math.max(0, (args[0] || 1) - 1));
        break;
      case "m": // SGR - Select Graphic Rendition
        this.handleSGR(args.length ? args : [0]);
        break;
      case "r": // Set scrolling region
        this.scrollTop = (args[0] || 1) - 1;
        this.scrollBottom = (args[1] || this.rows) - 1;
        break;
      case "s": // Save cursor
        this.savedCursor = { ...this.cursor };
        break;
      case "u": // Restore cursor
        if (this.savedCursor) {
          this.cursor = { ...this.savedCursor };
        }
        break;
      case "h": // Set mode
        if (params.startsWith("?")) {
          this.handlePrivateMode(params.slice(1), true);
        }
        break;
      case "l": // Reset mode
        if (params.startsWith("?")) {
          this.handlePrivateMode(params.slice(1), false);
        }
        break;
      case "n": // Device status report
        // Ignored in virtual terminal
        break;
      case "c": // Device attributes
        // Ignored
        break;
    }
  }

  private handlePrivateMode(params: string, enable: boolean) {
    const modes = params.split(";").map((p) => parseInt(p, 10));
    for (const mode of modes) {
      switch (mode) {
        case 1049: // Alternate screen buffer
          if (enable) {
            this.alternateBuffer = this.buffer;
            this.buffer = this.createEmptyBuffer();
            this.useAlternateBuffer = true;
          } else {
            if (this.alternateBuffer) {
              this.buffer = this.alternateBuffer;
              this.alternateBuffer = null;
            }
            this.useAlternateBuffer = false;
          }
          break;
        case 25: // Show/hide cursor
          this.cursorVisible = enable;
          break;
        case 1: // Application cursor keys
        case 7: // Auto-wrap mode
        case 1000: // Mouse tracking
        case 1002:
        case 1003:
        case 1006:
        case 2004: // Bracketed paste
          // Ignored for now
          break;
      }
    }
  }

  private handleSGR(args: number[]) {
    for (let i = 0; i < args.length; i++) {
      const code = args[i]!;

      if (code === 0) {
        this.currentStyle = { ...DEFAULT_STYLE };
      } else if (code === 1) {
        this.currentStyle.bold = true;
      } else if (code === 2) {
        this.currentStyle.dim = true;
      } else if (code === 3) {
        this.currentStyle.italic = true;
      } else if (code === 4) {
        this.currentStyle.underline = true;
      } else if (code === 7) {
        this.currentStyle.inverse = true;
      } else if (code === 22) {
        this.currentStyle.bold = false;
        this.currentStyle.dim = false;
      } else if (code === 23) {
        this.currentStyle.italic = false;
      } else if (code === 24) {
        this.currentStyle.underline = false;
      } else if (code === 27) {
        this.currentStyle.inverse = false;
      } else if (code >= 30 && code <= 37) {
        this.currentStyle.fg = COLORS_16[code - 30] || "white";
      } else if (code === 38) {
        // Extended foreground color
        if (args[i + 1] === 5 && args[i + 2] !== undefined) {
          // 256 color
          this.currentStyle.fg = this.color256ToName(args[i + 2]!);
          i += 2;
        } else if (args[i + 1] === 2 && args[i + 4] !== undefined) {
          // RGB color
          this.currentStyle.fg = this.rgbToCyan(args[i + 2]!, args[i + 3]!, args[i + 4]!);
          i += 4;
        }
      } else if (code === 39) {
        this.currentStyle.fg = "white";
      } else if (code >= 40 && code <= 47) {
        this.currentStyle.bg = COLORS_16[code - 40] || "transparent";
      } else if (code === 48) {
        // Extended background color
        if (args[i + 1] === 5 && args[i + 2] !== undefined) {
          this.currentStyle.bg = this.color256ToName(args[i + 2]!);
          i += 2;
        } else if (args[i + 1] === 2 && args[i + 4] !== undefined) {
          this.currentStyle.bg = this.rgbToCyan(args[i + 2]!, args[i + 3]!, args[i + 4]!);
          i += 4;
        }
      } else if (code === 49) {
        this.currentStyle.bg = "transparent";
      } else if (code >= 90 && code <= 97) {
        this.currentStyle.fg = COLORS_16[code - 90 + 8] || "white";
      } else if (code >= 100 && code <= 107) {
        this.currentStyle.bg = COLORS_16[code - 100 + 8] || "transparent";
      }
    }
  }

  private isMagenta(r: number, g: number, b: number): boolean {
    // Catch more magenta/pink variants with lower threshold
    return r > 80 && b > 80 && g < r && g < b;
  }

  private color256ToName(code: number): string {
    if (code < 16) {
      return COLORS_16[code] || "white";
    } else if (code < 232) {
      // 216 color cube
      const idx = code - 16;
      const ri = Math.floor(idx / 36);
      const gi = Math.floor((idx % 36) / 6);
      const bi = idx % 6;
      const toVal = (v: number) => (v === 0 ? 0 : v * 40 + 55);
      const r = toVal(ri), g = toVal(gi), b = toVal(bi);
      if (this.isMagenta(r, g, b)) return "cyan";
      return `rgb(${r},${g},${b})`;
    } else {
      // Grayscale
      const gray = (code - 232) * 10 + 8;
      return `rgb(${gray},${gray},${gray})`;
    }
  }

  private rgbToCyan(r: number, g: number, b: number): string {
    if (this.isMagenta(r, g, b)) return "cyan";
    return `rgb(${r},${g},${b})`;
  }

  private putChar(char: string) {
    if (this.cursor.col >= this.cols) {
      this.cursor.col = 0;
      this.lineFeed();
    }
    const targetRow = this.buffer[this.cursor.row];
    if (targetRow) {
      targetRow[this.cursor.col] = {
        char,
        style: { ...this.currentStyle },
      };
    }
    this.cursor.col++;
  }

  private lineFeed() {
    if (this.cursor.row >= this.scrollBottom) {
      this.scrollUp(1);
    } else {
      this.cursor.row++;
    }
  }

  private reverseIndex() {
    if (this.cursor.row <= this.scrollTop) {
      this.scrollDown(1);
    } else {
      this.cursor.row--;
    }
  }

  private index() {
    if (this.cursor.row >= this.scrollBottom) {
      this.scrollUp(1);
    } else {
      this.cursor.row++;
    }
  }

  private scrollUp(lines: number) {
    for (let i = 0; i < lines; i++) {
      this.buffer.splice(this.scrollTop, 1);
      const newRow = Array.from({ length: this.cols }, () => ({
        char: " ",
        style: { ...DEFAULT_STYLE },
      }));
      this.buffer.splice(this.scrollBottom, 0, newRow);
    }
  }

  private scrollDown(lines: number) {
    for (let i = 0; i < lines; i++) {
      this.buffer.splice(this.scrollBottom, 1);
      const newRow = Array.from({ length: this.cols }, () => ({
        char: " ",
        style: { ...DEFAULT_STYLE },
      }));
      this.buffer.splice(this.scrollTop, 0, newRow);
    }
  }

  private eraseInDisplay(mode: number) {
    if (mode === 0) {
      // Erase from cursor to end
      this.eraseInLine(0);
      for (let r = this.cursor.row + 1; r < this.rows; r++) {
        this.clearRow(r);
      }
    } else if (mode === 1) {
      // Erase from start to cursor
      for (let r = 0; r < this.cursor.row; r++) {
        this.clearRow(r);
      }
      this.eraseInLine(1);
    } else if (mode === 2 || mode === 3) {
      // Erase entire display
      for (let r = 0; r < this.rows; r++) {
        this.clearRow(r);
      }
    }
  }

  private eraseInLine(mode: number) {
    const row = this.buffer[this.cursor.row];
    if (!row) return;

    if (mode === 0) {
      // Erase from cursor to end
      for (let c = this.cursor.col; c < this.cols; c++) {
        row[c] = { char: " ", style: { ...DEFAULT_STYLE } };
      }
    } else if (mode === 1) {
      // Erase from start to cursor
      for (let c = 0; c <= this.cursor.col; c++) {
        row[c] = { char: " ", style: { ...DEFAULT_STYLE } };
      }
    } else if (mode === 2) {
      // Erase entire line
      this.clearRow(this.cursor.row);
    }
  }

  private clearRow(row: number) {
    if (this.buffer[row]) {
      for (let c = 0; c < this.cols; c++) {
        this.buffer[row][c] = { char: " ", style: { ...DEFAULT_STYLE } };
      }
    }
  }

  private insertLines(count: number) {
    for (let i = 0; i < count; i++) {
      this.buffer.splice(this.scrollBottom, 1);
      const newRow = Array.from({ length: this.cols }, () => ({
        char: " ",
        style: { ...DEFAULT_STYLE },
      }));
      this.buffer.splice(this.cursor.row, 0, newRow);
    }
  }

  private deleteLines(count: number) {
    for (let i = 0; i < count; i++) {
      this.buffer.splice(this.cursor.row, 1);
      const newRow = Array.from({ length: this.cols }, () => ({
        char: " ",
        style: { ...DEFAULT_STYLE },
      }));
      this.buffer.splice(this.scrollBottom, 0, newRow);
    }
  }

  private insertChars(count: number) {
    const row = this.buffer[this.cursor.row];
    if (!row) return;
    for (let i = 0; i < count; i++) {
      row.pop();
      row.splice(this.cursor.col, 0, { char: " ", style: { ...DEFAULT_STYLE } });
    }
  }

  private deleteChars(count: number) {
    const row = this.buffer[this.cursor.row];
    if (!row) return;
    row.splice(this.cursor.col, count);
    for (let i = 0; i < count; i++) {
      row.push({ char: " ", style: { ...DEFAULT_STYLE } });
    }
  }

  private eraseChars(count: number) {
    const row = this.buffer[this.cursor.row];
    if (!row) return;
    for (let i = 0; i < count && this.cursor.col + i < this.cols; i++) {
      row[this.cursor.col + i] = { char: " ", style: { ...DEFAULT_STYLE } };
    }
  }

  private reset() {
    this.buffer = this.createEmptyBuffer();
    this.cursor = { row: 0, col: 0 };
    this.currentStyle = { ...DEFAULT_STYLE };
    this.scrollTop = 0;
    this.scrollBottom = this.rows - 1;
  }

  // Public getters for rendering
  getBuffer(): Cell[][] {
    return this.buffer;
  }

  getCursor(): CursorPosition {
    return this.cursor;
  }

  getRows(): number {
    return this.rows;
  }

  getCols(): number {
    return this.cols;
  }
}
