/**
 * AcpSession - client side of the Agent Client Protocol (v1) on top of ACPClient.
 *
 * Owns the conversation timeline (messages, thoughts, tool calls, plan), answers the
 * agent's requests (fs/*, terminal/*, session/request_permission) and exposes a plain
 * subscribe/getState API so React can render it and tests can drive it without a UI.
 *
 * Spec: https://agentclientprotocol.com/protocol
 */
import * as path from "path";
import * as fs from "fs/promises";
import { ACPClient } from "../ACP";

export type ToolStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export interface ToolDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

export type TimelineEntry =
  | { kind: "user"; id: number; text: string }
  | { kind: "assistant"; id: number; text: string }
  | { kind: "thought"; id: number; text: string }
  | { kind: "system"; id: number; text: string; level: "info" | "error" }
  | {
      kind: "tool";
      id: number;
      toolCallId: string;
      title: string;
      toolKind: string;
      status: ToolStatus;
      text: string;
      diffs: ToolDiff[];
      locations: { path: string; line?: number }[];
    };

export interface PlanEntry {
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority?: string;
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
}

export interface PendingPermission {
  title: string;
  toolKind: string;
  options: PermissionOption[];
}

export type AcpStatus = "disconnected" | "connecting" | "connected";

export interface AcpState {
  status: AcpStatus;
  agentName: string;
  timeline: TimelineEntry[];
  plan: PlanEntry[];
  busy: boolean;
  permission: PendingPermission | null;
  error: string | null;
  commands: { name: string; description?: string }[];
}

export interface ConnectOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd: string;
  /** Allow fs/terminal access outside cwd (default false). */
  allowOutsideCwd?: boolean;
}

interface ManagedTerminal {
  proc: ReturnType<typeof Bun.spawn>;
  output: string;
  truncated: boolean;
  limit: number;
  exit: Promise<{ exitCode: number | null; signal: string | null }>;
  exitStatus: { exitCode: number | null; signal: string | null } | null;
}

const isRecord = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null;

function contentText(content: unknown): string {
  if (!content) return "";
  if (Array.isArray(content)) return content.map(contentText).join("");
  if (!isRecord(content)) return "";
  if (content.type === "text" && typeof content.text === "string") return content.text;
  if (content.type === "content") return contentText(content.content);
  if (content.type === "resource_link" && typeof content.uri === "string") return content.uri;
  return "";
}

export class AcpSession {
  private client: ACPClient | null = null;
  private sessionId: string | null = null;
  private cwd = process.cwd();
  private allowOutsideCwd = false;
  private nextId = 1;
  private listeners = new Set<() => void>();
  private permissionResolve: ((optionId: string | null) => void) | null = null;
  private terminals = new Map<string, ManagedTerminal>();
  private terminalSeq = 0;
  private stderrTail = "";
  private state: AcpState = {
    status: "disconnected",
    agentName: "",
    timeline: [],
    plan: [],
    busy: false,
    permission: null,
    error: null,
    commands: [],
  };

  getState = (): AcpState => this.state;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private set(patch: Partial<AcpState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private push(entry: Omit<TimelineEntry, "id"> & { kind: TimelineEntry["kind"] }) {
    this.set({ timeline: [...this.state.timeline, { ...entry, id: this.nextId++ } as TimelineEntry] });
  }

  private system(text: string, level: "info" | "error" = "info") {
    this.push({ kind: "system", text, level } as any);
  }

  /** Append streamed text to the trailing entry of `kind`, or start a new one. */
  private appendText(kind: "assistant" | "thought" | "user", text: string) {
    const tl = this.state.timeline;
    const last = tl[tl.length - 1];
    if (last && last.kind === kind) {
      const updated = { ...last, text: last.text + text };
      this.set({ timeline: [...tl.slice(0, -1), updated] });
    } else {
      this.push({ kind, text } as any);
    }
  }

  private updateTool(toolCallId: string, patch: (t: Extract<TimelineEntry, { kind: "tool" }>) => Extract<TimelineEntry, { kind: "tool" }>) {
    const tl = this.state.timeline;
    const i = tl.findIndex((e) => e.kind === "tool" && e.toolCallId === toolCallId);
    if (i === -1) return false;
    const next = tl.slice();
    next[i] = patch(tl[i] as Extract<TimelineEntry, { kind: "tool" }>);
    this.set({ timeline: next });
    return true;
  }

  async connect(opts: ConnectOptions) {
    this.disconnect(false);
    this.cwd = path.resolve(opts.cwd);
    this.allowOutsideCwd = !!opts.allowOutsideCwd;
    this.stderrTail = "";
    const agentName = [opts.command, ...(opts.args ?? [])].join(" ");
    this.set({ status: "connecting", error: null, agentName, busy: false, permission: null, plan: [] });

    const client = new ACPClient({
      command: opts.command,
      args: opts.args,
      env: opts.env,
      cwd: this.cwd,
      onNotification: (method, params) => this.onNotification(method, params),
      onRequest: (method, params) => this.onRequest(method, params),
      onStderr: (text) => {
        this.stderrTail = (this.stderrTail + text).slice(-2000);
      },
      onExit: (code) => {
        if (this.client !== client) return;
        this.client = null;
        this.sessionId = null;
        this.cancelPermission();
        const detail = this.stderrTail.trim().split("\n").slice(-3).join(" | ");
        const msg = `Agent exited${code !== null ? ` (code ${code})` : ""}${detail ? `: ${detail}` : ""}`;
        this.set({ status: "disconnected", busy: false, error: this.state.status === "connecting" ? msg : this.state.error });
        this.system(msg, code ? "error" : "info");
      },
    });
    this.client = client;

    try {
      await client.connect();
      const init = await client.sendRequest<any>("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
        clientInfo: { name: "termide", version: "0.1.0" },
      });
      if (this.client !== client) return;
      const name = init?.agentInfo?.title || init?.agentInfo?.name;
      const session = await client.sendRequest<any>("session/new", { cwd: this.cwd, mcpServers: [] });
      if (this.client !== client) return;
      this.sessionId = session?.sessionId ?? null;
      if (!this.sessionId) throw new Error("Agent did not return a sessionId");
      this.set({ status: "connected", agentName: name || agentName });
      this.system(`Connected to ${name || agentName}`);
    } catch (e: any) {
      if (this.client !== client) return;
      const detail = this.stderrTail.trim().split("\n").slice(-3).join(" | ");
      const msg = `${e?.message ?? e}${detail ? ` — ${detail}` : ""}`;
      this.disconnect(false);
      this.set({ status: "disconnected", error: msg });
      this.system(`Error: ${msg}`, "error");
    }
  }

  disconnect(announce = true) {
    const had = !!this.client;
    this.cancelPermission();
    for (const t of this.terminals.values()) {
      try { t.proc.kill(); } catch {}
    }
    this.terminals.clear();
    const c = this.client;
    this.client = null;
    this.sessionId = null;
    c?.kill();
    if (had) {
      this.set({ status: "disconnected", busy: false });
      if (announce) this.system("Disconnected");
    }
  }

  async prompt(text: string) {
    const client = this.client;
    if (!client || !this.sessionId || !text.trim()) return;
    this.push({ kind: "user", text } as any);
    this.set({ busy: true });
    try {
      const res = await client.sendRequest<any>("session/prompt", {
        sessionId: this.sessionId,
        prompt: [{ type: "text", text }],
      });
      const reason = res?.stopReason;
      if (reason && reason !== "end_turn") {
        const labels: Record<string, string> = {
          cancelled: "Cancelled",
          max_tokens: "Stopped: token limit reached",
          max_turn_requests: "Stopped: too many requests in one turn",
          refusal: "The agent refused to continue",
        };
        this.system(labels[reason] ?? `Stopped: ${reason}`, reason === "cancelled" ? "info" : "error");
      }
    } catch (e: any) {
      if (this.client === client) this.system(`Error: ${e?.message ?? e}`, "error");
    } finally {
      if (this.client === client) this.set({ busy: false });
    }
  }

  /** Cancel the running turn (spec: session/cancel + mark unfinished tools cancelled). */
  cancel() {
    if (!this.client || !this.sessionId || !this.state.busy) return;
    this.cancelPermission();
    this.client.sendNotification("session/cancel", { sessionId: this.sessionId });
    this.set({
      timeline: this.state.timeline.map((e) =>
        e.kind === "tool" && (e.status === "pending" || e.status === "in_progress") ? { ...e, status: "cancelled" as const } : e,
      ),
    });
  }

  /** Answer the pending permission request; null = cancelled. */
  respondPermission(optionId: string | null) {
    const r = this.permissionResolve;
    this.permissionResolve = null;
    this.set({ permission: null });
    r?.(optionId);
  }

  private cancelPermission() {
    if (this.permissionResolve) this.respondPermission(null);
  }

  // ---- agent → client notifications -------------------------------------------------

  private onNotification(method: string, params: unknown) {
    if (method !== "session/update" || !isRecord(params) || !isRecord(params.update)) return;
    const u = params.update;
    switch (u.sessionUpdate) {
      case "agent_message_chunk":
        this.appendText("assistant", contentText(u.content));
        break;
      case "agent_thought_chunk":
        this.appendText("thought", contentText(u.content));
        break;
      case "user_message_chunk":
        this.appendText("user", contentText(u.content));
        break;
      case "tool_call": {
        const entry = this.toolFromUpdate(u);
        if (!this.updateTool(entry.toolCallId, (t) => ({ ...t, ...entry, id: t.id }))) this.push(entry as any);
        break;
      }
      case "tool_call_update": {
        const id = String(u.toolCallId ?? "");
        const found = this.updateTool(id, (t) => {
          const n = this.toolFromUpdate(u, t);
          return { ...t, ...n, id: t.id };
        });
        if (!found) this.push(this.toolFromUpdate(u) as any);
        break;
      }
      case "plan":
        if (Array.isArray(u.entries)) {
          this.set({
            plan: u.entries.filter(isRecord).map((e: any) => ({ content: String(e.content ?? ""), status: e.status ?? "pending", priority: e.priority })),
          });
        }
        break;
      case "available_commands_update":
        if (Array.isArray(u.availableCommands)) {
          this.set({ commands: u.availableCommands.filter(isRecord).map((c: any) => ({ name: String(c.name), description: c.description })) });
        }
        break;
    }
  }

  private toolFromUpdate(u: Record<string, any>, prev?: Extract<TimelineEntry, { kind: "tool" }>) {
    const diffs: ToolDiff[] = prev?.diffs ? [...prev.diffs] : [];
    let text = prev?.text ?? "";
    if (Array.isArray(u.content)) {
      // tool_call_update replaces the content collection when present.
      diffs.length = 0;
      text = "";
      for (const c of u.content) {
        if (!isRecord(c)) continue;
        if (c.type === "diff" && typeof c.path === "string") {
          diffs.push({ path: c.path, oldText: c.oldText ?? null, newText: String(c.newText ?? "") });
        } else if (c.type === "terminal" && typeof c.terminalId === "string") {
          const t = this.terminals.get(c.terminalId);
          if (t) text += t.output;
        } else {
          text += contentText(c);
        }
      }
    }
    return {
      kind: "tool" as const,
      toolCallId: String(u.toolCallId ?? prev?.toolCallId ?? ""),
      title: typeof u.title === "string" ? u.title : prev?.title ?? "Tool",
      toolKind: typeof u.kind === "string" ? u.kind : prev?.toolKind ?? "other",
      status: (typeof u.status === "string" ? u.status : prev?.status ?? "pending") as ToolStatus,
      text,
      diffs,
      locations: Array.isArray(u.locations) ? u.locations.filter(isRecord).map((l: any) => ({ path: String(l.path), line: l.line })) : prev?.locations ?? [],
    };
  }

  // ---- agent → client requests ------------------------------------------------------

  private resolvePath(p: unknown): string {
    if (typeof p !== "string" || !p) throw new Error("Invalid path");
    const abs = path.resolve(this.cwd, p);
    if (!this.allowOutsideCwd && abs !== this.cwd && !abs.startsWith(this.cwd + path.sep)) {
      throw new Error(`Path outside the project is not allowed: ${abs}`);
    }
    return abs;
  }

  private async onRequest(method: string, params: unknown): Promise<unknown> {
    const p = isRecord(params) ? params : {};
    switch (method) {
      case "fs/read_text_file": {
        const file = this.resolvePath(p.path);
        let content = await Bun.file(file).text();
        if (typeof p.line === "number" || typeof p.limit === "number") {
          const lines = content.split("\n");
          const start = Math.max(0, (typeof p.line === "number" ? p.line : 1) - 1);
          const end = typeof p.limit === "number" ? start + p.limit : undefined;
          content = lines.slice(start, end).join("\n");
        }
        return { content };
      }
      case "fs/write_text_file": {
        const file = this.resolvePath(p.path);
        if (typeof p.content !== "string") throw new Error("Missing content");
        await fs.mkdir(path.dirname(file), { recursive: true });
        await Bun.write(file, p.content);
        return null;
      }
      case "session/request_permission":
        return this.requestPermission(p);
      case "terminal/create":
        return this.terminalCreate(p);
      case "terminal/output": {
        const t = this.terminal(p.terminalId);
        return { output: t.output, truncated: t.truncated, ...(t.exitStatus ? { exitStatus: t.exitStatus } : {}) };
      }
      case "terminal/wait_for_exit":
        return await this.terminal(p.terminalId).exit;
      case "terminal/kill":
        try { this.terminal(p.terminalId).proc.kill(); } catch {}
        return null;
      case "terminal/release": {
        const id = String(p.terminalId);
        const t = this.terminals.get(id);
        if (t) {
          try { t.proc.kill(); } catch {}
          this.terminals.delete(id);
        }
        return null;
      }
    }
    throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }

  private requestPermission(p: Record<string, any>): Promise<unknown> {
    const options: PermissionOption[] = Array.isArray(p.options)
      ? p.options.filter(isRecord).map((o: any) => ({ optionId: String(o.optionId), name: String(o.name ?? o.optionId), kind: String(o.kind ?? "") }))
      : [];
    const tc = isRecord(p.toolCall) ? p.toolCall : {};
    const existing = this.state.timeline.find((e) => e.kind === "tool" && e.toolCallId === tc.toolCallId) as
      | Extract<TimelineEntry, { kind: "tool" }>
      | undefined;
    if (isRecord(tc) && tc.toolCallId && !existing) this.push(this.toolFromUpdate(tc) as any);
    this.cancelPermission();
    return new Promise((resolve) => {
      this.permissionResolve = (optionId) =>
        resolve({ outcome: optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" } });
      this.set({
        permission: {
          title: typeof tc.title === "string" ? tc.title : existing?.title ?? "Tool call",
          toolKind: typeof tc.kind === "string" ? tc.kind : existing?.toolKind ?? "other",
          options,
        },
      });
    });
  }

  private terminal(id: unknown): ManagedTerminal {
    const t = this.terminals.get(String(id));
    if (!t) throw new Error(`Unknown terminal ${id}`);
    return t;
  }

  private terminalCreate(p: Record<string, any>) {
    if (typeof p.command !== "string" || !p.command) throw new Error("Missing command");
    const cwd = p.cwd ? this.resolvePath(p.cwd) : this.cwd;
    const env: Record<string, string> = {};
    if (Array.isArray(p.env)) for (const e of p.env) if (isRecord(e) && e.name) env[String(e.name)] = String(e.value ?? "");
    const args: string[] = Array.isArray(p.args) ? p.args.map(String) : [];
    // Agents commonly send a whole shell line as `command`; run it through the shell then.
    const argv = args.length === 0 && /\s/.test(p.command) ? [process.env.SHELL || "/bin/sh", "-c", p.command] : [p.command, ...args];
    const proc = Bun.spawn(argv, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const id = `term_${++this.terminalSeq}`;
    const limit = typeof p.outputByteLimit === "number" && p.outputByteLimit > 0 ? p.outputByteLimit : 1_000_000;
    const t: ManagedTerminal = {
      proc,
      output: "",
      truncated: false,
      limit,
      exitStatus: null,
      exit: null as any,
    };
    const pump = async (stream: ReadableStream<Uint8Array>) => {
      const dec = new TextDecoder();
      for await (const chunk of stream) {
        t.output += dec.decode(chunk, { stream: true });
        // Keep the tail within the byte limit, cutting at a character boundary.
        if (Buffer.byteLength(t.output) > t.limit) {
          t.truncated = true;
          let s = t.output;
          while (Buffer.byteLength(s) > t.limit) s = s.slice(Math.ceil((Buffer.byteLength(s) - t.limit) / 4) || 1);
          t.output = s;
        }
      }
    };
    const pumps = Promise.all([pump(proc.stdout as ReadableStream<Uint8Array>), pump(proc.stderr as ReadableStream<Uint8Array>)]).catch(() => {});
    t.exit = Promise.all([proc.exited, pumps]).then(([code]) => {
      t.exitStatus = { exitCode: proc.signalCode ? null : code, signal: proc.signalCode ?? null };
      return t.exitStatus;
    });
    this.terminals.set(id, t);
    return { terminalId: id };
  }
}
