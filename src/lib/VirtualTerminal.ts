/**
 * VirtualTerminal - A terminal emulator that parses ANSI sequences
 * SIMPLIFIED VERSION: Ignores complex colors to prevent magenta issues
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
  fg: "#f0f0f0",
  bg: "transparent",
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
};

// ANSI color codes - Simplified palette
// Use off-white #f0f0f0 to avoid magenta issues
const COLORS_16 = [
  "black", "red", "green", "yellow", "blue", "#f0f0f0", "cyan", "#f0f0f0",
  "gray", "red", "green", "yellow", "blue", "#f0f0f0", "cyan", "#f0f0f0"
];

export class VirtualTerminal {
    private rows: number;
    private cols: number;
    private buffer: Cell[][];
    private history: Cell[][] = [];
    private maxHistory: number = 10000;
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
    this.buffer = newBuffer as Cell[][] ;
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
          this.parseBuffer = data.slice(i);
          return;
        }

        const next = data[i + 1];

        if (next === "[") {
          // CSI sequence
          const match = data.slice(i).match(/^\x1b\[([0-9;?:]*)([A-Za-z@`])/);
          if (!match) {
            if (data.length - i < 20) {
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
          // OSC sequence - Skip
          const end = data.indexOf("\x07", i);
          const stEnd = data.indexOf("\x1b\\", i);
          if (end === -1 && stEnd === -1) {
            this.parseBuffer = data.slice(i);
            return;
          }
          const endPos = end !== -1 && (stEnd === -1 || end < stEnd) ? end + 1 : (stEnd !== -1 ? stEnd + 2 : i + 2);
          i = endPos;
        } else {
            // Other ESC sequences - Skip simple ones
            if (next === "(" || next === ")" || next === "*" || next === "+") i += 3;
            else i += 2;
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
        i++;
      } else if (char.charCodeAt(0) < 32) {
        i++;
      } else {
        this.putChar(char);
        i++;
      }
    }

    this.parseBuffer = "";
  }

  private handleCSI(params: string, command: string) {
    const normalizedParams = params.replace(/:/g, ";");
    const args = normalizedParams ? normalizedParams.split(";").map((p) => parseInt(p, 10) || 0) : [];

    switch (command) {
      case "A": this.cursor.row = Math.max(0, this.cursor.row - (args[0] || 1)); break;
      case "B": this.cursor.row = Math.min(this.rows - 1, this.cursor.row + (args[0] || 1)); break;
      case "C": this.cursor.col = Math.min(this.cols - 1, this.cursor.col + (args[0] || 1)); break;
      case "D": this.cursor.col = Math.max(0, this.cursor.col - (args[0] || 1)); break;
      case "E": this.cursor.col = 0; this.cursor.row = Math.min(this.rows - 1, this.cursor.row + (args[0] || 1)); break;
      case "F": this.cursor.col = 0; this.cursor.row = Math.max(0, this.cursor.row - (args[0] || 1)); break;
      case "G": this.cursor.col = Math.min(this.cols - 1, Math.max(0, (args[0] || 1) - 1)); break;
      case "H": 
      case "f":
        this.cursor.row = Math.min(this.rows - 1, Math.max(0, (args[0] || 1) - 1));
        this.cursor.col = Math.min(this.cols - 1, Math.max(0, (args[1] || 1) - 1));
        break;
      case "J": this.eraseInDisplay(args[0] || 0); break;
      case "K": this.eraseInLine(args[0] || 0); break;
      case "L": this.insertLines(args[0] || 1); break;
      case "M": this.deleteLines(args[0] || 1); break;
      case "P": this.deleteChars(args[0] || 1); break;
      case "@": this.insertChars(args[0] || 1); break;
      case "S": this.scrollUp(args[0] || 1); break;
      case "T": this.scrollDown(args[0] || 1); break;
      case "X": this.eraseChars(args[0] || 1); break;
      case "d": this.cursor.row = Math.min(this.rows - 1, Math.max(0, (args[0] || 1) - 1)); break;
      case "m": this.handleSGR(args.length ? args : [0]); break;
      case "r": 
        this.scrollTop = (args[0] || 1) - 1;
        this.scrollBottom = (args[1] || this.rows) - 1;
        break;
      case "s": this.savedCursor = { ...this.cursor }; break;
      case "u": if (this.savedCursor) this.cursor = { ...this.savedCursor }; break;
      case "h": if (params.startsWith("?")) this.handlePrivateMode(params.slice(1), true); break;
      case "l": if (params.startsWith("?")) this.handlePrivateMode(params.slice(1), false); break;
    }
  }

  private handlePrivateMode(params: string, enable: boolean) {
    const modes = params.split(";").map((p) => parseInt(p, 10));
    for (const mode of modes) {
      if (mode === 1049) {
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
      } else if (mode === 25) {
        this.cursorVisible = enable;
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
        // ANSI Colors - Mapped to simplified palette
        this.currentStyle.fg = COLORS_16[code - 30] || "white";
      } else if (code === 38) {
        // Extended color (256/RGB)
        // Only allow Grayscale for suggestions/comments, map others to white
        if (args[i + 1] === 5 && args[i + 2] !== undefined) {
          // 256 color
          const c256 = args[i + 2]!;
          if (c256 >= 232 || c256 === 8 || c256 === 7 || c256 === 240) { // Known grays
             this.currentStyle.fg = "gray";
          } else {
             this.currentStyle.fg = "#f0f0f0";
          }
          i += 2;
        } else if (args[i + 1] === 2 && args[i + 4] !== undefined) {
          // RGB color
          const r = args[i + 2]!;
          const g = args[i + 3]!;
          const b = args[i + 4]!;
          // Check if it's grayscale (all components roughly equal)
          if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && Math.abs(r - b) < 10) {
              // If it's very dark or very light, adjust if needed, but 'gray' usually works well
              this.currentStyle.fg = "gray";
          } else {
              this.currentStyle.fg = "#f0f0f0";
          }
          i += 4;
        }
      } else if (code === 39) {
        this.currentStyle.fg = "white";
      } else if (code >= 40 && code <= 47) {
        this.currentStyle.bg = "transparent"; // Ignore backgrounds
      } else if (code === 48) {
        // Extended background - IGNORE
        if (args[i + 1] === 5) i += 2;
        else if (args[i + 1] === 2) i += 4;
      } else if (code === 49) {
        this.currentStyle.bg = "transparent";
      } else if (code >= 90 && code <= 97) {
         this.currentStyle.fg = COLORS_16[code - 90 + 8] || "white";
      } else if (code >= 100 && code <= 107) {
        this.currentStyle.bg = "transparent";
      }
    }
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

  private scrollUp(lines: number) {
    for (let i = 0; i < lines; i++) {
      const removedRow = this.buffer.splice(this.scrollTop, 1)[0];
      // Save to history if we are not using alternate buffer
      if (!this.useAlternateBuffer && removedRow) {
        this.history.push(removedRow);
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }
      }

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
      this.eraseInLine(0);
      for (let r = this.cursor.row + 1; r < this.rows; r++) this.clearRow(r);
    } else if (mode === 1) {
      for (let r = 0; r < this.cursor.row; r++) this.clearRow(r);
      this.eraseInLine(1);
    } else if (mode === 2 || mode === 3) {
      for (let r = 0; r < this.rows; r++) this.clearRow(r);
    }
  }

  private eraseInLine(mode: number) {
    const row = this.buffer[this.cursor.row];
    if (!row) return;
    if (mode === 0) {
      for (let c = this.cursor.col; c < this.cols; c++) row[c] = { char: " ", style: { ...DEFAULT_STYLE } };
    } else if (mode === 1) {
      for (let c = 0; c <= this.cursor.col; c++) row[c] = { char: " ", style: { ...DEFAULT_STYLE } };
    } else if (mode === 2) {
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

  getBuffer(): Cell[][] { return this.buffer; }
  
  // Get a specific view of the terminal including history
  // offset 0 = current screen
  // offset > 0 = scrolling up into history
  getView(offset: number, height: number): Cell[][] {
    if (offset === 0) return this.buffer;
    
    // We need to combine history (end) + buffer (start)
    const totalHistory = this.history.length;
    const effectiveOffset = Math.min(offset, totalHistory);
    
    const output: Cell[][] = [];
    
    // How many lines from history?
    // We start reading history from (totalHistory - effectiveOffset)
    const historyStartIndex = totalHistory - effectiveOffset;
    
    // Fill with history lines
    for (let i = 0; i < height; i++) {
      const historyIndex = historyStartIndex + i;
      if (historyIndex < totalHistory) {
        output.push(this.history[historyIndex]);
      } else {
        // We ran out of history, continue with buffer
        const bufferIndex = historyIndex - totalHistory;
        if (this.buffer[bufferIndex]) {
          output.push(this.buffer[bufferIndex]);
        }
      }
    }
    
    return output;
  }
  
  getHistorySize(): number { return this.history.length; }

  getCursor(): CursorPosition { return this.cursor; }
  getRows(): number { return this.rows; }
  getCols(): number { return this.cols; }
}