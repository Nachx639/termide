import { test, expect } from "bun:test";
import { splitPatch } from "./DiffViewer";

test("splitPatch separates the commit header and each file", () => {
  const show = `abc123 Fix things
Someone · 2 days ago

Body line

diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/new.md b/new.md
new file mode 100644
--- /dev/null
+++ b/new.md
@@ -0,0 +1 @@
+hello
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
`;
  const { preamble, files } = splitPatch(show);
  expect(preamble.split("\n")[0]).toBe("abc123 Fix things");
  expect(files.map((f) => f.path)).toEqual(["src/a.ts", "new.md", "gone.txt"]);
  expect(files[0]!.patch.startsWith("diff --git a/src/a.ts")).toBe(true);
  expect(files[0]!.patch).not.toContain("new.md");
});

test("a plain single-file diff passes through", () => {
  const d = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n";
  expect(splitPatch(d)).toEqual({ preamble: "", files: [{ path: "", patch: d }] });
});
