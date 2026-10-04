import { test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AcpSession, type TimelineEntry } from "./AcpSession";

const MOCK = path.join(import.meta.dir, "fixtures", "mock-agent.ts");
let dir: string;
let s: AcpSession;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-acp-"));
  s = new AcpSession();
  await s.connect({ command: "bun", args: [MOCK], cwd: dir });
});
afterEach(() => {
  s.disconnect(false);
  fs.rmSync(dir, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await Bun.sleep(10);
  }
  throw new Error("timeout");
}
const last = (kind: TimelineEntry["kind"]) => [...s.getState().timeline].reverse().find((e) => e.kind === kind) as any;

test("connects and streams the reply, thoughts and plan", async () => {
  expect(s.getState().status).toBe("connected");
  expect(s.getState().agentName).toBe("Mock Agent");
  await s.prompt("hola ñandú");
  expect(last("assistant").text).toBe("echo: hola ñandú");
  expect(last("thought").text).toBe("hmm");
  expect(s.getState().plan).toEqual([{ content: "reply", status: "completed", priority: "high" }]);
  expect(s.getState().busy).toBe(false);
});

test("serves fs/read_text_file relative to the project", async () => {
  fs.writeFileSync(path.join(dir, "a.txt"), "secret sauce");
  await s.prompt("read a.txt");
  expect(last("assistant").text).toBe("content: secret sauce");
});

test("refuses paths outside the project", async () => {
  await s.prompt("read /etc/hosts");
  expect(last("assistant").text).toContain("outside the project");
});

test("write asks permission and only writes when allowed", async () => {
  const turn = s.prompt("write sub/out.txt hello world");
  await waitFor(() => !!s.getState().permission);
  expect(s.getState().permission!.title).toBe("Write sub/out.txt");
  expect(s.getState().permission!.options.map((o) => o.kind)).toEqual(["allow_once", "reject_once"]);
  s.respondPermission("yes");
  await turn;
  expect(fs.readFileSync(path.join(dir, "sub/out.txt"), "utf8")).toBe("hello world");
  const tool = last("tool");
  expect(tool.status).toBe("completed");
  expect(tool.diffs).toEqual([{ path: "sub/out.txt", oldText: null, newText: "hello world" }]);
});

test("rejected permission writes nothing", async () => {
  const turn = s.prompt("write nope.txt x");
  await waitFor(() => !!s.getState().permission);
  s.respondPermission("no");
  await turn;
  expect(fs.existsSync(path.join(dir, "nope.txt"))).toBe(false);
  expect(last("tool").status).toBe("failed");
});

test("runs terminal commands for the agent", async () => {
  await s.prompt("run echo from-terminal && exit 2");
  expect(last("assistant").text).toBe("exit 2");
  expect(last("tool").text).toContain("from-terminal");
});

test("cancel stops the turn and marks tools cancelled", async () => {
  const turn = s.prompt("slow");
  await waitFor(() => last("tool")?.status === "in_progress");
  s.cancel();
  await turn;
  expect(s.getState().busy).toBe(false);
  expect(last("tool").status).toBe("cancelled");
  expect(last("system").text).toBe("Cancelled");
});

test("agent crash ends the turn and surfaces stderr", async () => {
  await s.prompt("crash");
  await waitFor(() => s.getState().status === "disconnected");
  expect(s.getState().busy).toBe(false);
  const msgs = s.getState().timeline.filter((e) => e.kind === "system").map((e: any) => e.text).join("\n");
  expect(msgs).toContain("code 3");
  expect(msgs).toContain("fatal: mock crash");
});

test("missing agent binary reports a useful error", async () => {
  const t = new AcpSession();
  await t.connect({ command: "definitely-not-an-agent-xyz", cwd: dir });
  expect(t.getState().status).toBe("disconnected");
  expect(t.getState().error).toBeTruthy();
});
