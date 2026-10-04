import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { detectFileInfo, formatEncoding, formatLineEnding, formatIndent, type FileInfo } from "./FileEncoding";

let dir: string;
let n = 0;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide encoding "));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function info(content: string | Buffer | Uint8Array): FileInfo {
  const f = path.join(dir, `file ${n++}.txt`);
  fs.writeFileSync(f, content);
  return detectFileInfo(f);
}

describe("encoding", () => {
  test("ascii, utf-8 and empty files", () => {
    expect(info("hello\n").encoding).toBe("ascii");
    expect(info("héllo 🐜 日本\n").encoding).toBe("utf-8");
    expect(info("").encoding).toBe("ascii");
  });

  test("BOMs", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const utf8bom = info(Buffer.concat([bom, Buffer.from("x\n")]));
    expect(utf8bom.encoding).toBe("utf-8-bom");
    expect(utf8bom.hasBOM).toBe(true);
    expect(info(Buffer.from([0xfe, 0xff, 0, 0x41])).encoding).toBe("utf-16-be");
    expect(info(Buffer.from([0xff, 0xfe, 0x41, 0])).encoding).toBe("utf-16-le");
    expect(info(Buffer.from([0, 0, 0xfe, 0xff, 0, 0, 0, 0x41])).encoding).toBe("utf-32-be");
    expect(info(Buffer.from([0xff, 0xfe, 0, 0, 0x41, 0, 0, 0])).encoding).toBe("utf-32-le");
    expect(info("x").hasBOM).toBe(false);
  });

  test("latin1 (invalid utf-8 high bytes)", () => {
    // "café" in ISO-8859-1
    expect(info(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a])).encoding).toBe("latin1");
  });

  test("truncated utf-8 sequence at end of file is not valid utf-8", () => {
    expect(info(Buffer.from([0x61, 0xe2, 0x82])).encoding).toBe("latin1");
  });

  test("binary content (many NUL bytes)", () => {
    const buf = Buffer.alloc(2048);
    buf.write("ELF", 0);
    expect(info(buf).encoding).toBe("binary");
  });

  test("missing file falls back to defaults", () => {
    expect(detectFileInfo(path.join(dir, "does not exist"))).toEqual({
      encoding: "utf-8",
      lineEnding: "LF",
      hasBOM: false,
      indentStyle: "none",
      indentSize: 2,
    });
  });

  test("large files are handled", () => {
    const big = "const x = 1; // ñ\n".repeat(200_000); // ~3.6MB
    const start = performance.now();
    const r = info(big);
    expect(r.encoding).toBe("utf-8");
    expect(r.lineEnding).toBe("LF");
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe("line endings", () => {
  test("LF, CRLF, CR, mixed and none", () => {
    expect(info("a\nb\n").lineEnding).toBe("LF");
    expect(info("a\r\nb\r\n").lineEnding).toBe("CRLF");
    expect(info("a\rb\r").lineEnding).toBe("CR");
    expect(info("a\r\nb\n").lineEnding).toBe("Mixed");
    expect(info("a\rb\n").lineEnding).toBe("Mixed");
    expect(info("a\r\nb\r").lineEnding).toBe("Mixed");
    expect(info("no newline").lineEnding).toBe("LF");
    expect(info("").lineEnding).toBe("LF");
  });
});

describe("indentation", () => {
  test("no indentation", () => {
    expect(info("a\nb\n")).toMatchObject({ indentStyle: "none", indentSize: 2 });
  });

  test("tabs", () => {
    expect(info("a {\n\tb\n\t\tc\n}\n")).toMatchObject({ indentStyle: "tabs" });
  });

  test("2-space file with deeper nesting is still 2 spaces", () => {
    const code = [
      "class A {",
      "  method() {",
      "    const a = 1;",
      "    const b = 2;",
      "    const c = 3;",
      "    return a + b + c;",
      "  }",
      "}",
    ].join("\n");
    expect(info(code)).toMatchObject({ indentStyle: "spaces", indentSize: 2 });
  });

  test("4-space file", () => {
    const code = "def f():\n    x = 1\n    if x:\n        y = 2\n    return x\n";
    expect(info(code)).toMatchObject({ indentStyle: "spaces", indentSize: 4 });
  });

  test("JSDoc continuation lines do not skew detection", () => {
    const code = [
      "/**",
      " * one",
      " * two",
      " * three",
      " * four",
      " */",
      "function f() {",
      "  return 1;",
      "}",
    ].join("\n");
    expect(info(code)).toMatchObject({ indentStyle: "spaces", indentSize: 2 });
  });

  test("tab-indented file with JSDoc is tabs, not mixed", () => {
    const code = "class A {\n\t/**\n\t * doc\n\t */\n\tm() {\n\t\treturn 1;\n\t}\n}\n";
    expect(info(code)).toMatchObject({ indentStyle: "tabs" });
  });

  test("CRLF files detect indentation too", () => {
    expect(info("a {\r\n    b\r\n}\r\n")).toMatchObject({ indentStyle: "spaces", indentSize: 4 });
  });

  test("mixed tabs and spaces", () => {
    expect(info("a\n\tb\n  c\n").indentStyle).toBe("mixed");
  });
});

describe("formatting", () => {
  const base: FileInfo = { encoding: "utf-8", lineEnding: "LF", hasBOM: false, indentStyle: "spaces", indentSize: 4 };

  test("formatEncoding", () => {
    expect(formatEncoding(base)).toBe("UTF-8");
    expect(formatEncoding({ ...base, encoding: "utf-8-bom", hasBOM: true })).toBe("UTF-8-BOM");
    expect(formatEncoding({ ...base, encoding: "utf-16-le", hasBOM: true })).toBe("UTF-16-LE BOM");
  });

  test("formatLineEnding", () => {
    expect(formatLineEnding("CRLF")).toBe("CRLF");
    expect(formatLineEnding("Mixed")).toBe("Mixed");
  });

  test("formatIndent", () => {
    expect(formatIndent(base)).toBe("Spc:4");
    expect(formatIndent({ ...base, indentStyle: "tabs" })).toBe("Tab");
    expect(formatIndent({ ...base, indentStyle: "mixed" })).toBe("Mixed");
    expect(formatIndent({ ...base, indentStyle: "none" })).toBe("");
  });
});
