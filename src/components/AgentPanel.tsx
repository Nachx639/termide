import React, { useState, useEffect, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { useACP } from "../hooks/useACP";

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

// Predefined agents with their commands
const AGENTS: AgentConfig[] = [
    { id: "claude", name: "Claude", icon: "🤖", command: "claude-code-acp", description: "Anthropic Claude Code" },
    {
        id: "claude-antigravity",
        name: "Claude (Antigravity)",
        icon: "🌀",
        command: "./bin/claude-antigravity",
        description: "Claude via Antigravity proxy",
        proxyCommand: "antigravity-claude-proxy start"
    },
    { id: "gemini", name: "Gemini", icon: "✨", command: "gemini --experimental-acp", description: "Google Gemini CLI" },
    { id: "custom", name: "Custom...", icon: "⚙️", command: "", description: "Enter custom command" },
];

interface AgentPanelProps {
    rootPath: string;
    focused: boolean;
    onFocus: () => void;
}

export function AgentPanel({ rootPath, focused, onFocus }: AgentPanelProps) {
    const { connect, disconnect, sendMessage, messages, status, error } = useACP();
    const [inputValue, setInputValue] = useState("");
    const [isSetup, setIsSetup] = useState(true);
    const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
    const [isCustomMode, setIsCustomMode] = useState(false);
    const [customCommand, setCustomCommand] = useState("");

    const lastEscapeRef = React.useRef<number>(0);
    const scrollEndRef = useRef<any>(null);
    // Model selection for Antigravity
    const [isModelSelectMode, setIsModelSelectMode] = useState(false);
    const [selectedModelIndex, setSelectedModelIndex] = useState(0);

    // Switch to chat mode automatically if connected
    useEffect(() => {
        if (status === 'connected') {
            setIsSetup(false);
        } else if (status === 'disconnected') {
            setIsSetup(true);
        }
        // Don't change isSetup when status is 'connecting' - we'll handle that in the UI
    }, [status]);

    useKeyboard((event) => {
        if (!focused) return;

        // Double Escape to disconnect agent (within 500ms)
        if (event.name === "escape") {
            const now = Date.now();
            if (now - lastEscapeRef.current < 500) {
                disconnect();
                setIsSetup(true);
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

        if (event.name === "return") {
            if (isSetup) {
                // Model selection mode for Antigravity
                if (isModelSelectMode) {
                    const selectedModel = ANTIGRAVITY_MODELS[selectedModelIndex];
                    if (selectedModel) {
                        // Write selected model to settings.json
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
                            }
                        };
                        // Write synchronously using Bun
                        try {
                            Bun.write(settingsPath, JSON.stringify(settings, null, 2));
                        } catch (e) {
                            console.error("Failed to write settings:", e);
                        }

                        // Now connect with the Antigravity agent
                        const selectedAgent = AGENTS.find(a => a.id === "claude-antigravity");
                        if (selectedAgent) {
                            const parts = selectedAgent.command.split(" ");
                            const cmd = parts[0]!;
                            const args = parts.slice(1);
                            connect(cmd, args, selectedAgent.env, selectedAgent.proxyCommand);
                        }
                        setIsModelSelectMode(false);
                    }
                    return;
                }

                const selectedAgent = AGENTS[selectedAgentIndex];
                if (!selectedAgent) return;

                // If selecting Antigravity, show model selector
                if (selectedAgent.id === "claude-antigravity") {
                    setIsModelSelectMode(true);
                    setSelectedModelIndex(0);
                    return;
                }

                if (selectedAgent.id === "custom") {
                    if (isCustomMode && customCommand.trim()) {
                        const parts = customCommand.trim().split(" ");
                        const cmd = parts[0]!;
                        const args = parts.slice(1);
                        connect(cmd, args);
                    } else {
                        setIsCustomMode(true);
                    }
                } else if (status !== 'connected') {
                    const parts = selectedAgent.command.split(" ");
                    const cmd = parts[0]!;
                    const args = parts.slice(1);
                    connect(cmd, args, selectedAgent.env, selectedAgent.proxyCommand);
                }
            } else {
                if (inputValue.trim()) {
                    sendMessage(inputValue);
                    setInputValue("");
                }
            }
            return;
        }

        if (event.name === "backspace") {
            if (isSetup && isCustomMode) {
                setCustomCommand(prev => prev.slice(0, -1));
            } else if (!isSetup) {
                setInputValue(prev => prev.slice(0, -1));
            }
            return;
        }

        // Handle space key explicitly
        if (event.name === "space") {
            if (isSetup && isCustomMode) {
                setCustomCommand(prev => prev + " ");
            } else if (!isSetup) {
                setInputValue(prev => prev + " ");
            }
            return;
        }

        // Handle arrow keys
        if (event.name === "up" || event.name === "down") {
            if (isSetup && isModelSelectMode) {
                // Navigate model selector
                setSelectedModelIndex(prev => {
                    if (event.name === "up") {
                        return prev > 0 ? prev - 1 : ANTIGRAVITY_MODELS.length - 1;
                    } else {
                        return prev < ANTIGRAVITY_MODELS.length - 1 ? prev + 1 : 0;
                    }
                });
            } else if (isSetup && !isCustomMode) {
                // Navigate agent selector
                setSelectedAgentIndex(prev => {
                    if (event.name === "up") {
                        return prev > 0 ? prev - 1 : AGENTS.length - 1;
                    } else {
                        return prev < AGENTS.length - 1 ? prev + 1 : 0;
                    }
                });
            }
            return;
        }

        if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
            if (isSetup && isCustomMode) {
                setCustomCommand(prev => prev + event.name);
            } else if (!isSetup) {
                setInputValue(prev => prev + event.name);
            }
        }
    });

    return (
        <box style={{ flexDirection: "column", height: "100%", border: true, borderColor: focused ? "cyan" : "gray" }} onMouseDown={onFocus}>
            {/* Header */}
            <box style={{ height: 1, paddingX: 1, flexDirection: "row", justifyContent: "space-between", marginBottom: 1 }}>
                <box style={{ flexDirection: "row" }}>
                    <text style={{ fg: "cyan", bold: true }}>AI Agent </text>
                    <text style={{ fg: status === 'connected' ? 'green' : (status === 'connecting' ? 'yellow' : 'red') }}>({status})</text>
                </box>
                <text style={{ fg: "gray" }}>Esc Esc: disconnect</text>
            </box>

            {/* Content */}
            <box style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}>
                {status === 'connecting' ? (
                    // Show loading screen when connecting
                    <box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
                        <text style={{ fg: "yellow", bold: true, marginBottom: 1 }}>Starting agent...</text>
                        <text style={{ fg: "gray" }}>Please wait while the AI agent initializes</text>
                        <text style={{ fg: "gray", marginTop: 1 }}>Press Esc Esc to cancel</text>
                    </box>
                ) : isSetup ? (
                    <box style={{ flexDirection: "column" }}>
                        {isModelSelectMode ? (
                            <>
                                <text style={{ fg: "yellow", marginBottom: 1 }}>Select Antigravity Model:</text>

                                {/* Model List */}
                                {ANTIGRAVITY_MODELS.map((model, index) => {
                                    const isSelected = index === selectedModelIndex;
                                    return (
                                        <box key={model.id} style={{ flexDirection: "row", paddingY: 0, bg: isSelected ? "#1a2a35" : undefined }}>
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

                                {/* Agent List */}
                                {AGENTS.map((agent, index) => {
                                    const isSelected = index === selectedAgentIndex;
                                    return (
                                        <box key={agent.id} style={{ flexDirection: "row", paddingY: 0, bg: isSelected ? "#1a2a35" : undefined }}>
                                            <text style={{ fg: isSelected ? "cyan" : "white" }}>
                                                {isSelected ? "▸ " : "  "}{agent.icon} {agent.name}
                                            </text>
                                            <text style={{ fg: "gray", dim: true }}> - {agent.description}</text>
                                        </box>
                                    );
                                })}

                                {/* Custom command input */}
                                {isCustomMode && (
                                    <box style={{ marginTop: 1 }}>
                                        <text style={{ fg: "yellow" }}>Command: </text>
                                        <text style={{ fg: "white" }}>{customCommand}</text>
                                        <text style={{ fg: "gray" }}>█</text>
                                    </box>
                                )}

                                <text style={{ fg: "gray", marginTop: 1 }}>↑↓ to select | Enter to connect{isCustomMode ? " | Esc to cancel" : ""}</text>
                                {error && <text style={{ fg: "red", marginTop: 1 }}>Error: {error}</text>}
                            </>
                        )}
                    </box>
                ) : (
                    <box style={{ flexDirection: "column", flexGrow: 1, justifyContent: "space-between" }}>
                        {/* Chat History */}
                        <scrollbox style={{ flexGrow: 1 }}>
                            <text style={{ fg: "white" as any }}>
                                {messages
                                    .filter(msg => {
                                        // Filter out ALL system messages except errors
                                        if (msg.role === 'system') {
                                            return msg.content.startsWith('Error:');
                                        }
                                        return true;
                                    })
                                    .slice(-20) // Show last 20 messages
                                    .map(msg => {
                                        const prefix = msg.role === 'user' ? '> ' : '';
                                        const content = `${prefix}${msg.content}`;
                                        return content;
                                    })
                                    .join('\n\n') // Separate messages with blank line
                                }
                            </text>
                            <box ref={scrollEndRef} style={{ height: 0 }} />
                        </scrollbox>

                        {/* Input Area - at bottom */}
                        <box style={{ height: 1, flexDirection: "row" }}>
                            <text style={{ fg: "gray" as any }}>{'> '}</text>
                            <text style={{ fg: "cyan" as any }}>{inputValue}</text>
                            <text style={{ fg: "gray" as any }}>█</text>
                        </box>
                    </box>
                )}
            </box>
        </box>
    );
}
