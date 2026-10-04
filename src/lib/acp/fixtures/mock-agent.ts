#!/usr/bin/env bun
/**
 * Minimal ACP agent for tests. Speaks JSON-RPC over stdio and, depending on the
 * prompt text, exercises the client capabilities:
 *   "read <path>"        fs/read_text_file and echo the content
 *   "write <path> <txt>" permission request, then fs/write_text_file
 *   "run <cmd>"          terminal/create + wait_for_exit + output
 *   "slow"               streams until session/cancel arrives
 *   "crash"              exits mid-turn
 *   anything else        streams "echo: <text>" in two chunks
 */
let nextId = 1000;
const pending = new Map<number, (v: any) => void>();
let cancelled = false;

const send = (msg: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
const request = (method: string, params: object) =>
  new Promise<any>((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    send({ id, method, params });
  });
const update = (sessionId: string, u: object) => send({ method: "session/update", params: { sessionId, update: u } });
const say = (sessionId: string, text: string) => update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text } });

async function prompt(sessionId: string, text: string): Promise<string> {
  cancelled = false;
  const [cmd, ...rest] = text.split(" ");
  if (cmd === "read") {
    const r = await request("fs/read_text_file", { sessionId, path: rest[0] });
    if (r.error) say(sessionId, `read failed: ${r.error.message}`);
    else say(sessionId, `content: ${r.result.content}`);
    return "end_turn";
  }
  if (cmd === "write") {
    const [file, ...words] = rest;
    update(sessionId, { sessionUpdate: "tool_call", toolCallId: "w1", title: `Write ${file}`, kind: "edit", status: "pending" });
    const perm = await request("session/request_permission", {
      sessionId,
      toolCall: { toolCallId: "w1" },
      options: [
        { optionId: "yes", name: "Allow", kind: "allow_once" },
        { optionId: "no", name: "Reject", kind: "reject_once" },
      ],
    });
    const outcome = perm.result?.outcome;
    if (outcome?.outcome === "cancelled") return "cancelled";
    if (outcome?.optionId !== "yes") {
      update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: "w1", status: "failed" });
      say(sessionId, "not allowed");
      return "end_turn";
    }
    const w = await request("fs/write_text_file", { sessionId, path: file, content: words.join(" ") });
    update(sessionId, {
      sessionUpdate: "tool_call_update",
      toolCallId: "w1",
      status: w.error ? "failed" : "completed",
      content: [{ type: "diff", path: file, oldText: null, newText: words.join(" ") }],
    });
    say(sessionId, w.error ? `write failed: ${w.error.message}` : "written");
    return "end_turn";
  }
  if (cmd === "run") {
    const t = await request("terminal/create", { sessionId, command: rest.join(" ") });
    const terminalId = t.result.terminalId;
    update(sessionId, { sessionUpdate: "tool_call", toolCallId: "r1", title: "Run", kind: "execute", status: "in_progress", content: [{ type: "terminal", terminalId }] });
    const exit = await request("terminal/wait_for_exit", { sessionId, terminalId });
    const out = await request("terminal/output", { sessionId, terminalId });
    await request("terminal/release", { sessionId, terminalId });
    update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: "r1", status: "completed", content: [{ type: "content", content: { type: "text", text: out.result.output } }] });
    say(sessionId, `exit ${exit.result.exitCode}`);
    return "end_turn";
  }
  if (cmd === "slow") {
    update(sessionId, { sessionUpdate: "tool_call", toolCallId: "s1", title: "Thinking hard", kind: "think", status: "in_progress" });
    while (!cancelled) {
      say(sessionId, ".");
      await Bun.sleep(20);
    }
    return "cancelled";
  }
  if (cmd === "crash") {
    say(sessionId, "bye");
    process.stderr.write("fatal: mock crash\n");
    process.exit(3);
  }
  update(sessionId, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hmm" } });
  say(sessionId, "echo: ");
  say(sessionId, text);
  update(sessionId, { sessionUpdate: "plan", entries: [{ content: "reply", status: "completed", priority: "high" }] });
  return "end_turn";
}

let buf = "";
for await (const chunk of Bun.stdin.stream()) {
  buf += new TextDecoder().decode(chunk);
  let nl: number;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)!(msg);
      pending.delete(msg.id);
      continue;
    }
    if (msg.method === "initialize") send({ id: msg.id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [], agentInfo: { name: "mock", title: "Mock Agent" } } });
    else if (msg.method === "session/new") send({ id: msg.id, result: { sessionId: "sess_1" } });
    else if (msg.method === "session/cancel") cancelled = true;
    else if (msg.method === "session/prompt") {
      const text = msg.params.prompt.map((b: any) => b.text).join("");
      prompt(msg.params.sessionId, text).then((stopReason) => send({ id: msg.id, result: { stopReason } }));
    }
  }
}
