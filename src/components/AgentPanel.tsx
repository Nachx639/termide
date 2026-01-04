import React, { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { useACP } from "../hooks/useACP";

// Predefined agents with their commands
const AGENTS = [
    { id: "claude", name: "Claude", icon: "🤖", command: "claude-code-acp", description: "Anthropic Claude Code" },
    { id: "gemini", name: "Gemini", icon: "✨", command: "gemini --experimental-acp", description: "Google Gemini CLI" },
    { id: "aider", name: "Aider", icon: "🔧", command: "aider", description: "AI Pair Programming (no ACP)" },
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
    const [scrollOffset, setScrollOffset] = useState(0);

    // Switch to chat mode automatically if connected
    useEffect(() => {
        if (status === 'connected') {
            setIsSetup(false);
        } else if (status === 'disconnected') {
            setIsSetup(true);
        }
    }, [status]);

    useKeyboard((event) => {
        if (!focused) return;

        // Ctrl+C to kill agent
        if (event.ctrl && event.name === "c") {
            if (status === 'connected') {
                disconnect();
            }
            return;
        }

        if (event.name === "escape") {
            if (isCustomMode) {
                setIsCustomMode(false);
            }
            return;
        }

        if (event.name === "return") {
            if (isSetup) {
                const selectedAgent = AGENTS[selectedAgentIndex];
                if (!selectedAgent) return;

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
                    connect(cmd, args);
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
            if (isSetup && !isCustomMode) {
                // Navigate agent selector
                setSelectedAgentIndex(prev => {
                    if (event.name === "up") {
                        return prev > 0 ? prev - 1 : AGENTS.length - 1;
                    } else {
                        return prev < AGENTS.length - 1 ? prev + 1 : 0;
                    }
                });
            } else if (!isSetup) {
                // Scroll chat history
                setScrollOffset(prev => {
                    const maxScroll = Math.max(0, messages.length - 10);
                    if (event.name === "up") {
                        return Math.min(prev + 1, maxScroll);
                    } else {
                        return Math.max(prev - 1, 0);
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
                <text style={{ fg: "gray" }}>↑↓ scroll | Ctrl+C stop</text>
            </box>

            {/* Content */}
            <box style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}>
                {isSetup ? (
                    <box style={{ flexDirection: "column" }}>
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
                    </box>
                ) : (
                    <box style={{ flexDirection: "column", flexGrow: 1, justifyContent: "space-between" }}>
                        {/* Chat History */}
                        <box style={{ flexDirection: "column" }}>
                            {messages
                                .filter(msg => {
                                    // Filter out verbose system messages
                                    if (msg.role === 'system') {
                                        if (msg.content.startsWith('Error:') ||
                                            msg.content.startsWith('Connected to agent:') ||
                                            msg.content.startsWith('Disconnected')) {
                                            return true;
                                        }
                                        return false;
                                    }
                                    return true;
                                })
                                .slice(-(10 + scrollOffset), scrollOffset > 0 ? -scrollOffset : undefined)
                                .map((msg, i) => (
                                    <box key={i} style={{ marginBottom: 0 }}>
                                        <text style={{ fg: msg.role === 'user' ? 'cyan' : (msg.role === 'system' ? 'yellow' : 'white') }}>
                                            {msg.role === 'user' ? '> ' : ''}{msg.content}
                                        </text>
                                    </box>
                                ))}
                        </box>

                        {/* Input Area - at bottom */}
                        <box style={{ height: 1, flexDirection: "row" }}>
                            <text style={{ fg: "gray" }}>{'> '}</text>
                            <text style={{ fg: "cyan" }}>{inputValue}</text>
                            <text style={{ fg: "gray" }}>█</text>
                        </box>
                    </box>
                )}
            </box>
        </box>
    );
}
