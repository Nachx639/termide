import { test, expect, describe } from "bun:test";
import { getFileIcon, getFileIconSimple } from "./FileIcons";

describe("getFileIcon", () => {
  test("directories: special names (case-insensitive) and defaults", () => {
    expect(getFileIcon("node_modules", true).icon).toBe("📦");
    expect(getFileIcon("Tests", true).icon).toBe("🧪");
    expect(getFileIcon("random", true)).toEqual({ icon: "📁", color: "#d4a800" });
    expect(getFileIcon("random", true, true)).toEqual({ icon: "📂", color: "#d4a800" });
  });

  test("special folders with the generic folder glyph open when expanded", () => {
    expect(getFileIcon("src", true, false)).toEqual({ icon: "📁", color: "blue" });
    expect(getFileIcon("src", true, true)).toEqual({ icon: "📂", color: "blue" });
    // custom glyphs are kept
    expect(getFileIcon("tests", true, true).icon).toBe("🧪");
  });

  test("a directory named like a special file is still a directory", () => {
    expect(getFileIcon("package.json", true).icon).toBe("📁");
  });

  test("special file names, exact and case-insensitive", () => {
    expect(getFileIcon("package.json", false).icon).toBe("📦");
    expect(getFileIcon("Dockerfile", false).icon).toBe("🐳");
    expect(getFileIcon("dockerfile", false).icon).toBe("🐳");
    expect(getFileIcon("README.md", false).icon).toBe("📖");
    expect(getFileIcon("readme.md", false).icon).toBe("📖");
    expect(getFileIcon("Readme.md", false).icon).toBe("📖");
    expect(getFileIcon("makefile", false).icon).toBe("🔨");
    expect(getFileIcon(".env.local", false).icon).toBe("🔒");
    expect(getFileIcon(".gitignore", false).icon).toBe("🙈");
  });

  test("extensions, case-insensitive, last extension wins", () => {
    expect(getFileIcon("main.ts", false)).toEqual({ icon: "󰛦", color: "blue" });
    expect(getFileIcon("PHOTO.PNG", false).icon).toBe("🖼️");
    expect(getFileIcon("backup.tar.gz", false).icon).toBe("📦");
    expect(getFileIcon("my file.py", false).icon).toBe("🐍");
    expect(getFileIcon("comp.test.tsx", false).icon).toBe("⚛️");
  });

  test("unknown, extensionless, empty and trailing-dot names fall back to default", () => {
    const def = { icon: "📄", color: "white" };
    expect(getFileIcon("data.unknownext", false)).toEqual(def);
    expect(getFileIcon("LICENSEFILE", false)).toEqual(def);
    expect(getFileIcon("", false)).toEqual(def);
    expect(getFileIcon("weird.", false)).toEqual(def);
  });

  test("returned icons are not shared mutable state", () => {
    const a = getFileIcon("src", true, true);
    a.icon = "X";
    expect(getFileIcon("src", true, true).icon).toBe("📂");
  });
});

describe("getFileIconSimple", () => {
  test("directories use expand/collapse arrows", () => {
    expect(getFileIconSimple("src", true, false).icon).toBe("▶");
    expect(getFileIconSimple("src", true, true).icon).toBe("▼");
  });

  test("categories by extension", () => {
    expect(getFileIconSimple("a.TS", false)).toEqual({ icon: "◆", color: "#d4a800" });
    expect(getFileIconSimple("a.css", false).icon).toBe("◇");
    expect(getFileIconSimple("a.json", false).icon).toBe("◈");
    expect(getFileIconSimple("a.md", false).icon).toBe("◎");
    expect(getFileIconSimple(".env", false).icon).toBe("◉");
    expect(getFileIconSimple("run.sh", false)).toEqual({ icon: "▣", color: "green" });
    expect(getFileIconSimple("a.py", false).color).toBe("blue");
    expect(getFileIconSimple("a.rs", false).color).toBe("red");
    expect(getFileIconSimple("a.go", false).color).toBe("cyan");
  });

  test("unknown / no extension", () => {
    expect(getFileIconSimple("Makefile", false)).toEqual({ icon: "○", color: "white" });
    expect(getFileIconSimple("", false)).toEqual({ icon: "○", color: "white" });
  });
});
