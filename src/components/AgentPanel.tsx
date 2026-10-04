import React, { useState, useEffect, useRef } from "react";
import * as path from "path";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { useACP } from "../hooks/useACP";
import { getTermideSyntaxStyle } from "../lib/SyntaxStyles";
import type { TimelineEntry, ToolStatus } from "../lib/acp/AcpSession";

// Agent configuration with optional environment variables
interface AgentConfig {
    id: string;
    name: string;
    icon: string;
    command: string;
    description: string;
    env?: Record<string, string>;
    proxyCommand?: string; // Command to start a required proxy before connecting
}

// Available models for Antigravity proxy
const ANTIGRAVITY_MODELS = [
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", icon: "🎭" },
    { id: "claude-sonnet-4-5-thinking", name: "Claude Sonnet 4.5 (Thinking)", icon: "🤔" },
    { id: "claude-opus-4-5-thinking", name: "Claude Opus 4.5 (Thinking)", icon: "🎼" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash", icon: "⚡" },
    { id: "gemini-3-pro-low", name: "Gemini 3 Pro (Low)", icon: "💎" },
    { id: "gemini-3-pro-high", name: "Gemini 3 Pro (High)", icon: "💎" },
];

// Bundled with termide, not with the project being edited.
const ANTIGRAVITY_BIN = path.join(import.meta.dir, "..", "..", "bin", "claude-antigravity");

// Claude Code's ACP adapter: an installed binary (current name, then the
// deprecated @zed-industries one), else run it straight from npm via bunx.
function claudeAcpCommand(): string {
    if (Bun.which("claude-agent-acp")) return "claude-agent-acp";
    if (Bun.which("claude-code-acp")) return "claude-code-acp";
    return "bunx @agentclientprotocol/claude-agent-acp";
}

/** How to get an agent whose executable is missing. */
const INSTALL_HINTS: Record<string, string> = {
    gemini: "npm install -g @google/gemini-cli",
    "claude-agent-acp": "npm install -g @agentclientprotocol/claude-agent-acp",
    "claude-code-acp": "npm install -g @agentclientprotocol/claude-agent-acp",
    "antigravity-claude-proxy": "npm install -g antigravity-claude-proxy",
};

function installHint(error: string | null): string | null {
    const m = error?.match(/not found[^"]*"([^"]+)"/i) ?? error?.match(/Executable not found in \$PATH: "?([^"\s]+)/);
    const bin = m?.[1]?.split("/").pop();
    return bin && INSTALL_HINTS[bin] ? `Install it with: ${INSTALL_HINTS[bin]}` : null;
}

// Predefined agents with their commands
const AGENTS: AgentConfig[] = [
    { id: "claude", name: "Claude", icon: "🤖", command: claudeAcpCommand(), description: "Anthropic Claude Code" },
    {
        id: "claude-antigravity",
        name: "Claude (Antigravity)",
        icon: "🌀",
        command: ANTIGRAVITY_BIN,
        description: "Claude via Antigravity proxy",
        proxyCommand: "antigravity-claude-proxy start"
    },
    { id: "gemini", name: "Gemini", icon: "✨", command: "gemini --experimental-acp", description: "Google Gemini CLI" },
    { id: "custom", name: "Custom...", icon: "⚙️", command: "", description: "Enter custom command" },
];

const STATUS_ICON: Record<ToolStatus, { icon: string; color: string }> = {
    pending: { icon: "○", color: "gray" },
    in_progress: { icon: "◐", color: "yellow" },
    completed: { icon: "✓", color: "green" },
    failed: { icon: "✗", color: "red" },
    cancelled: { icon: "⊘", color: "gray" },
};

const PLAN_ICON: Record<string, string> = { pending: "○", in_progress: "◐", completed: "✓" };

function diffStats(oldText: string | null, newText: string) {
    const a = oldText ? oldText.split("\n") : [];
    const b = newText.split("\n");
    const setA = new Set(a);
    const setB = new Set(b);
    return { added: b.filter((l) => !setA.has(l)).length, removed: a.filter((l) => !setB.has(l)).length };
}

function lastLines(text: string, n: number) {
    return text.replace(/\s+$/, "").split("\n").slice(-n);
}

interface AgentPanelProps {
    rootPath: string;
    focused: boolean;
    onFocus: () => void;
    /** Private agent session instead of the project's shared one (tests). */
    isolated?: boolean;
}

export function AgentPanel({ rootPath, focused, onFocus, isolated = false }: AgentPanelProps) {
    const { state, connect, disconnect, prompt, cancel, respondPermission } = useACP(rootPath, isolated);
    const { status, timeline, busy, permission, plan, error } = state;
    const [inputValue, setInputValue] = useState("");
    const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
    const [isCustomMode, setIsCustomMode] = useState(false);
    const [customCommand, setCustomCommand] = useState("");
    const [permissionIndex, setPermissionIndex] = useState(0);
    const [showThoughts, setShowThoughts] = useState(false);

    const lastEscapeRef = useRef<number>(0);
    // Model selection for Antigravity
    const [isModelSelectMode, setIsModelSelectMode] = useState(false);
    const [selectedModelIndex, setSelectedModelIndex] = useState(0);

    const isSetup = status !== "connected";

    useEffect(() => setPermissionIndex(0), [permission]);

    const connectAgent = (agent: AgentConfig, commandLine = agent.command) => {
        const [cmd, ...args] = commandLine.trim().split(/\s+/);
        if (cmd) connect(cmd, args, agent.env, agent.proxyCommand);
    };

    // The native input hands us its value; our state may lag a render behind.
    const submit = (value?: string) => {
        const text = (typeof value === "string" ? value : inputValue).trim();
        if (!text || busy) return;
        prompt(text);
        setInputValue("");
    };

    useKeyboard((event) => {
        if (!focused) return;

        // Permission prompt takes over the keyboard until answered.
        if (permission) {
            const n = permission.options.length;
            if (event.name === "left" || event.name === "up") setPermissionIndex((i) => (i - 1 + n) % n);
            else if (event.name === "right" || event.name === "down" || event.name === "tab") setPermissionIndex((i) => (i + 1) % n);
            else if (event.name === "return") respondPermission(permission.options[permissionIndex]?.optionId ?? null);
            else if (event.name === "escape") respondPermission(null);
            else if (/^[1-9]$/.test(event.name) && Number(event.name) <= n) respondPermission(permission.options[Number(event.name) - 1]!.optionId);
            return;
        }

        if (event.name === "escape") {
            const now = Date.now();
            if (busy) {
                // Esc stops the running turn; Esc Esc disconnects.
                if (now - lastEscapeRef.current < 500) disconnect();
                else cancel();
            } else if (now - lastEscapeRef.current < 500) {
                disconnect();
                setIsCustomMode(false);
                setIsModelSelectMode(false);
            } else if (isCustomMode) {
                setIsCustomMode(false);
            } else if (isModelSelectMode) {
                setIsModelSelectMode(false);
            }
            lastEscapeRef.current = now;
            return;
        }

        if (!isSetup) {
            // Chat input is the native <input>; only panel-level shortcuts here.
            if (event.ctrl && event.name === "t") setShowThoughts((v) => !v);
            return;
        }

        if (status === "connecting") return;

        if (event.name === "return") {
            if (isModelSelectMode) {
                const selectedModel = ANTIGRAVITY_MODELS[selectedModelIndex];
                const agent = AGENTS.find((a) => a.id === "claude-antigravity");
                if (selectedModel && agent) {
                    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
                    const settingsPath = `${homeDir}/.claude-antigravity-home/.claude/settings.json`;
                    const settings = {
                        env: {
                            ANTHROPIC_AUTH_TOKEN: "test",
                            ANTHROPIC_BASE_URL: "http://localhost:8080",
                            ANTHROPIC_MODEL: selectedModel.id,
                            ANTHROPIC_DEFAULT_OPUS_MODEL: selectedModel.id,
                            ANTHROPIC_DEFAULT_SONNET_MODEL: selectedModel.id,
                            ANTHROPIC_DEFAULT_HAIKU_MODEL: selectedModel.id,
                        },
                    };
                    Bun.write(settingsPath, JSON.stringify(settings, null, 2))
                        .catch(() => {})
                        .finally(() => connectAgent(agent));
                    setIsModelSelectMode(false);
                }
                return;
            }

            const selectedAgent = AGENTS[selectedAgentIndex];
            if (!selectedAgent) return;
            if (selectedAgent.id === "claude-antigravity") {
                setIsModelSelectMode(true);
                setSelectedModelIndex(0);
            } else if (selectedAgent.id === "custom") {
                if (isCustomMode && customCommand.trim()) connectAgent(selectedAgent, customCommand);
                else setIsCustomMode(true);
            } else {
                connectAgent(selectedAgent);
            }
            return;
        }

        if (isCustomMode) {
            if (event.name === "backspace") setCustomCommand((prev) => prev.slice(0, -1));
            else if (event.name === "space") setCustomCommand((prev) => prev + " ");
            else if (event.sequence && !event.ctrl && !event.meta && !/[\x00-\x1f\x7f]/.test(event.sequence)) {
                setCustomCommand((prev) => prev + event.sequence);
            }
            return;
        }

        if (event.name === "up" || event.name === "down") {
            const delta = event.name === "up" ? -1 : 1;
            if (isModelSelectMode) {
                setSelectedModelIndex((prev) => (prev + delta + ANTIGRAVITY_MODELS.length) % ANTIGRAVITY_MODELS.length);
            } else {
                setSelectedAgentIndex((prev) => (prev + delta + AGENTS.length) % AGENTS.length);
            }
        }
    });

    const toolCount = timeline.filter((e) => e.kind === "tool").length;
    const bottomTitle =
        status === "connected"
            ? ` ${busy ? "working… · Esc: stop · " : ""}${toolCount} tools · ${state.agentName} `
            : status === "connecting"
            ? " connecting… "
            : " disconnected ";

    const renderEntry = (entry: TimelineEntry, isLast: boolean) => {
        switch (entry.kind) {
            case "user":
                return (
                    <box key={entry.id} style={{ flexDirection: "row" }}>
                        <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>{"> "}</text>
                        <text style={{ fg: "cyan" }}>{entry.text}</text>
                    </box>
                );
            case "assistant":
                return (
                    <markdown
                        key={entry.id}
                        content={entry.text}
                        syntaxStyle={getTermideSyntaxStyle()}
                        conceal
                        streaming={isLast && busy}
                        tableOptions={{ widthMode: "content", borders: true, borderStyle: "rounded", selectable: true }}
                    />
                );
            case "thought": {
                if (!showThoughts && !(isLast && busy)) return null;
                const text = showThoughts ? entry.text : lastLines(entry.text, 1)[0] ?? "";
                return (
                    <text key={entry.id} style={{ fg: "gray", attributes: TextAttributes.ITALIC | TextAttributes.DIM }}>
                        {`✻ ${text}`}
                    </text>
                );
            }
            case "system":
                return (
                    <text key={entry.id} style={{ fg: entry.level === "error" ? "red" : "gray", attributes: entry.level === "error" ? 0 : TextAttributes.DIM }}>
                        {entry.text}
                    </text>
                );
            case "tool": {
                const st = STATUS_ICON[entry.status] ?? STATUS_ICON.pending;
                const where = entry.locations[0];
                const output = entry.diffs.length === 0 && entry.text ? lastLines(entry.text, entry.status === "in_progress" ? 3 : 2) : [];
                return (
                    <box key={entry.id} style={{ flexDirection: "column" }}>
                        <box style={{ flexDirection: "row" }}>
                            <text style={{ fg: st.color, attributes: TextAttributes.BOLD }}>{`${st.icon} `}</text>
                            <text style={{ fg: "white", attributes: TextAttributes.BOLD }}>{entry.title}</text>
                            {where && !entry.title.includes(path.basename(where.path)) && (
                                <text style={{ fg: "gray" }}>{`  ${path.relative(rootPath, where.path) || where.path}${where.line ? `:${where.line}` : ""}`}</text>
                            )}
                        </box>
                        {entry.diffs.map((d) => {
                            const { added, removed } = diffStats(d.oldText, d.newText);
                            return (
                                <box key={d.path} style={{ flexDirection: "row", paddingLeft: 2 }}>
                                    <text style={{ fg: "gray" }}>{`${path.relative(rootPath, path.resolve(rootPath, d.path))} `}</text>
                                    <text style={{ fg: "green" }}>{`+${added} `}</text>
                                    <text style={{ fg: "red" }}>{`-${removed}`}</text>
                                    {d.oldText === null && <text style={{ fg: "gray" }}> (new file)</text>}
                                </box>
                            );
                        })}
                        {output.map((line, i) => (
                            <text key={i} wrapMode="none" style={{ fg: "gray", attributes: TextAttributes.DIM, paddingLeft: 2 } as any}>
                                {`│ ${line}`}
                            </text>
                        ))}
                    </box>
                );
            }
        }
    };

    return (
        <box
            style={{ flexDirection: "column", height: "100%", border: true, borderColor: focused ? "cyan" : "gray" }}
            bottomTitle={bottomTitle}
            bottomTitleAlignment="right"
            onMouseDown={onFocus}
        >
            {/* Header */}
            <box style={{ height: 1, paddingX: 1, flexDirection: "row", justifyContent: "space-between", flexShrink: 0 }}>
                <box style={{ flexDirection: "row" }}>
                    {focused && <text style={{ fg: "black", bg: "cyan", attributes: TextAttributes.BOLD }}> FOCUS </text>}
                    <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>AI Agent </text>
                    <text style={{ fg: status === "connected" ? "green" : status === "connecting" ? "yellow" : "red" }}>({status})</text>
                </box>
                <text style={{ fg: "gray" }}>{busy ? "Esc: stop · Esc Esc: disconnect" : "Ctrl+T: thoughts · Esc Esc: disconnect"}</text>
            </box>

            {/* Content */}
            <box style={{ flexGrow: 1, flexDirection: "column", paddingX: 1 }}>
                {status === "connecting" ? (
                    <box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
                        <text style={{ fg: "yellow", attributes: TextAttributes.BOLD }}>Starting agent...</text>
                        <text style={{ fg: "gray" }}>{state.agentName}</text>
                        <text style={{ fg: "gray" }}>Press Esc Esc to cancel</text>
                    </box>
                ) : isSetup ? (
                    <box style={{ flexDirection: "column", paddingTop: 1 }}>
                        {isModelSelectMode ? (
                            <>
                                <text style={{ fg: "yellow", marginBottom: 1 }}>Select Antigravity Model:</text>
                                {ANTIGRAVITY_MODELS.map((model, index) => {
                                    const isSelected = index === selectedModelIndex;
                                    return (
                                        <box key={model.id} style={{ flexDirection: "row", backgroundColor: isSelected ? "#1a2a35" : undefined }}>
                                            <text style={{ fg: isSelected ? "cyan" : "white" }}>
                                                {isSelected ? "▸ " : "  "}{model.icon} {model.name}
                                            </text>
                                        </box>
                                    );
                                })}
                                <text style={{ fg: "gray", marginTop: 1 }}>↑↓ to select | Enter to connect | Esc to go back</text>
                            </>
                        ) : (
                            <>
                                <text style={{ fg: "yellow", marginBottom: 1 }}>Select an AI Agent:</text>
                                {AGENTS.map((agent, index) => {
                                    const isSelected = index === selectedAgentIndex;
                                    return (
                                        <box key={agent.id} style={{ flexDirection: "row", backgroundColor: isSelected ? "#1a2a35" : undefined }}>
                                            <text style={{ fg: isSelected ? "cyan" : "white" }}>
                                                {isSelected ? "▸ " : "  "}{agent.icon} {agent.name}
                                            </text>
                                            <text style={{ fg: "gray", attributes: TextAttributes.DIM }}> - {agent.description}</text>
                                        </box>
                                    );
                                })}
                                {isCustomMode && (
                                    <text style={{ fg: "white", marginTop: 1 }}>
                                        <span fg="yellow">Command: </span>
                                        {customCommand}
                                        <span fg="gray">█</span>
                                    </text>
                                )}
                                <text style={{ fg: "gray", marginTop: 1 }}>↑↓ to select | Enter to connect{isCustomMode ? " | Esc to cancel" : ""}</text>
                                {error && <text style={{ fg: "red", marginTop: 1 }}>Error: {error}</text>}
                                {installHint(error) && <text style={{ fg: "yellow" }}>{installHint(error)}</text>}
                            </>
                        )}
                    </box>
                ) : (
                    <box style={{ flexDirection: "column", flexGrow: 1 }}>
                        <scrollbox style={{ flexGrow: 1 }} stickyScroll stickyStart="bottom">
                            <box style={{ flexDirection: "column", gap: 1 }}>
                                {timeline.slice(-60).map((e, i, arr) => renderEntry(e, i === arr.length - 1))}
                            </box>
                        </scrollbox>

                        {plan.length > 0 && busy && (
                            <box style={{ flexDirection: "column", flexShrink: 0, borderColor: "gray", border: ["top"] }}>
                                {plan.slice(0, 6).map((p, i) => (
                                    <text key={i} wrapMode="none" style={{ fg: p.status === "completed" ? "gray" : p.status === "in_progress" ? "yellow" : "white" }}>
                                        {`${PLAN_ICON[p.status] ?? "○"} ${p.content}`}
                                    </text>
                                ))}
                            </box>
                        )}

                        {permission ? (
                            <box style={{ flexDirection: "column", flexShrink: 0, height: 5, border: true, borderColor: "yellow", paddingX: 1 }}>
                                <text wrapMode="none" style={{ fg: "yellow", attributes: TextAttributes.BOLD, height: 1, flexShrink: 0 }}>{`Allow ${permission.title}?`}</text>
                                <box style={{ flexDirection: "row", gap: 2, height: 1, flexShrink: 0 }}>
                                    {permission.options.map((o, i) => {
                                        const sel = i === permissionIndex;
                                        const color = o.kind.startsWith("allow") ? "green" : "red";
                                        return (
                                            <text key={o.optionId} style={{ fg: sel ? "black" : color, bg: sel ? color : undefined, attributes: TextAttributes.BOLD }}>
                                                {` ${i + 1}. ${o.name} `}
                                            </text>
                                        );
                                    })}
                                </box>
                                <text wrapMode="none" style={{ fg: "gray", height: 1, flexShrink: 0 }}>←→ choose · Enter confirm · 1-9 pick · Esc reject</text>
                            </box>
                        ) : (
                            <box style={{ height: 1, flexDirection: "row", flexShrink: 0 }}>
                                <text style={{ fg: busy ? "yellow" : "cyan" }}>{busy ? "◐ " : "> "}</text>
                                <input
                                    focused={focused && !permission}
                                    value={inputValue}
                                    placeholder={busy ? "Agent is working… (Esc to stop)" : "Ask the agent…"}
                                    onInput={(v: string) => setInputValue(v)}
                                    onSubmit={(v: any) => submit(typeof v === "string" ? v : undefined)}
                                    style={{ flexGrow: 1, textColor: "white", placeholderColor: "gray", cursorColor: "cyan" }}
                                />
                            </box>
                        )}
                    </box>
                )}
            </box>
        </box>
    );
}
