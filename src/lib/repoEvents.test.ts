import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { onRepoChange } from "./repoEvents";

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !cond()) await Bun.sleep(20);
  return cond();
};

test("changes notify subscribers (debounced); node_modules does not; unsubscribe stops", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-repoev-"));
  fs.mkdirSync(path.join(dir, "node_modules"));
  let a = 0;
  let b = 0;
  const offA = onRepoChange(dir, () => a++);
  const offB = onRepoChange(dir, () => b++);
  try {
    await Bun.sleep(100);
    fs.writeFileSync(path.join(dir, "x.ts"), "1");
    fs.writeFileSync(path.join(dir, "y.ts"), "2");
    expect(await until(() => a === 1 && b === 1)).toBe(true);
    await Bun.sleep(400);
    expect(a).toBe(1); // two writes, one notification

    fs.writeFileSync(path.join(dir, "node_modules", "dep.js"), "x");
    await Bun.sleep(500);
    expect(a).toBe(1);

    offA();
    fs.writeFileSync(path.join(dir, "z.ts"), "3");
    expect(await until(() => b === 2)).toBe(true);
    expect(a).toBe(1);
  } finally {
    offA();
    offB();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
