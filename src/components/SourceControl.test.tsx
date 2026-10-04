import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { testRender } from "@opentui/react/test-utils";
import { SourceControl } from "./SourceControl";

type Setup = Awaited<ReturnType<typeof testRender>>;
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" });

async function waitForFrame(setup: Setup, cond: (f: string) => boolean, ms = 5000) {
  const end = Date.now() + ms;
  let frame = "";
  while (Date.now() < end) {
    await setup.renderOnce();
    frame = setup.captureCharFrame();
    if (cond(frame)) return frame;
    await Bun.sleep(40);
  }
  throw new Error(`frame never matched:\n${frame}`);
}

test("discard needs a second x; Enter commits the typed message", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "termide-sc-"));
  git(repo, "init", "-q");
  fs.writeFileSync(path.join(repo, "keep.txt"), "v1\n");
  fs.writeFileSync(path.join(repo, "oops.txt"), "v1\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  fs.writeFileSync(path.join(repo, "keep.txt"), "v2\n");
  fs.writeFileSync(path.join(repo, "oops.txt"), "broken\n");
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  const setup = await testRender(
    <box style={{ width: 60, height: 20 }}>
      <SourceControl rootPath={repo} focused={true} />
    </box>,
    { width: 60, height: 20 },
  );
  try {
    await waitForFrame(setup, (f) => f.includes("oops.txt") && f.includes("keep.txt"));
    setup.mockInput.pressArrow("down"); // oops.txt (second in the list)
    await Bun.sleep(50);
    await setup.renderOnce();
    setup.mockInput.pressKey("x");
    await waitForFrame(setup, (f) => f.includes("discard changes in oops.txt"));
    expect(fs.readFileSync(path.join(repo, "oops.txt"), "utf8")).toBe("broken\n");
    setup.mockInput.pressKey("x");
    await waitForFrame(setup, (f) => f.includes("Discarded"));
    expect(fs.readFileSync(path.join(repo, "oops.txt"), "utf8")).toBe("v1\n");
    expect(fs.readFileSync(path.join(repo, "keep.txt"), "utf8")).toBe("v2\n");

    await waitForFrame(setup, (f) => !f.includes("oops.txt"));
    setup.mockInput.pressKey("s"); // stage keep.txt
    await waitForFrame(setup, (f) => f.includes("Staged Changes"));
    setup.mockInput.pressKey("c");
    await waitForFrame(setup, (f) => f.includes("Commit Message"));
    await setup.mockInput.typeText("Fix the thing");
    await waitForFrame(setup, (f) => f.includes("Fix the thing"));
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (f) => f.includes("Committed"));
    expect(git(repo, "log", "-1", "--format=%s").trim()).toBe("Fix the thing");
  } finally {
    setup.renderer.destroy();
    fs.rmSync(repo, { recursive: true, force: true });
  }
}, 20000);
