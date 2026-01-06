import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { getGitLog } from "../lib/GitIntegration";

interface GitGraphProps {
    rootPath: string;
    focused: boolean;
    onFocus?: () => void;
}

export function GitGraph({ rootPath, focused, onFocus }: GitGraphProps) {
    const [logLines, setLogLines] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const dimensions = useTerminalDimensions();
    const fieldSeparator = "\x1f";

    const updateLog = useCallback(async () => {
        const lines = await getGitLog(rootPath, 30);
        setLogLines(lines);
    }, [rootPath]);

    useEffect(() => {
        updateLog();
        const interval = setInterval(updateLog, 10000); // 10s refresh for graph
        return () => clearInterval(interval);
    }, [updateLog]);

    const borderColor = focused ? "cyan" : "gray";

    const formatRelativeTime = (unixSecondsText: string) => {
        const unixSeconds = parseInt(unixSecondsText, 10);
        if (Number.isNaN(unixSeconds)) return unixSecondsText;

        const nowSeconds = Math.floor(Date.now() / 1000);
        let delta = Math.max(0, nowSeconds - unixSeconds);

        const units = [
            { name: "y", seconds: 365 * 24 * 60 * 60 },
            { name: "mo", seconds: 30 * 24 * 60 * 60 },
            { name: "w", seconds: 7 * 24 * 60 * 60 },
            { name: "d", seconds: 24 * 60 * 60 },
            { name: "h", seconds: 60 * 60 },
            { name: "m", seconds: 60 },
            { name: "s", seconds: 1 },
        ];

        const parts: string[] = [];
        for (const unit of units) {
            if (delta < unit.seconds) continue;
            const value = Math.floor(delta / unit.seconds);
            delta -= value * unit.seconds;
            parts.push(`${value}${unit.name}`);
            if (parts.length === 2) break;
        }

        if (parts.length === 0) return "0s";
        return parts.join(" ");
    };

    const compactRefs = (refs: string) => {
        const entries = refs
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);

        let headTarget = "";
        const filtered: string[] = [];

        for (const entry of entries) {
            if (entry.startsWith("HEAD -> ")) {
                headTarget = entry.slice("HEAD -> ".length).trim();
                continue;
            }
            if (entry === "origin/HEAD") continue;
            filtered.push(entry);
        }

        const tokens: string[] = [];
        if (headTarget) tokens.push(`HEAD->${headTarget}`);
        tokens.push(...filtered);

        if (tokens.length === 0) return "";
        if (tokens.length <= 2) return tokens.join(" ");

        return `${tokens.slice(0, 2).join(" ")} +${tokens.length - 2}`;
    };

    const splitGraphAndHash = (prefix: string) => {
        const match = prefix.match(/[0-9a-f]{7,}/);
        if (!match) return { graph: prefix, hash: "" };

        const hashIdx = prefix.indexOf(match[0]);
        return {
            graph: prefix.slice(0, hashIdx),
            hash: prefix.slice(hashIdx).trim(),
        };
    };

    const parseLegacyLine = (line: string) => {
        const firstHashIdx = line.search(/[0-9a-f]/);
        if (firstHashIdx === -1) {
            return {
                graph: line,
                hash: "",
                refs: "",
                subject: "",
                timeRaw: "",
                timeRelative: "",
                author: "",
                hasHead: false,
            };
        }

        const graph = line.slice(0, firstHashIdx);
        const textPart = line.slice(firstHashIdx).trim();
        const match = textPart.match(/^([0-9a-f]+)\s+(.*?)(?:\s+\((.+)\))?$/);

        if (!match) {
            return {
                graph,
                hash: "",
                refs: "",
                subject: textPart,
                timeRaw: "",
                timeRelative: "",
                author: "",
                hasHead: false,
            };
        }

        return {
            graph,
            hash: match[1] || "",
            refs: "",
            subject: match[2] || "",
            timeRaw: "",
            timeRelative: match[3] || "",
            author: "",
            hasHead: false,
        };
    };

    const parseLogLine = (line: string) => {
        if (!line.includes(fieldSeparator)) {
            return parseLegacyLine(line);
        }

        const [prefix, refs = "", subject = "", time = "", author = ""] = line.split(fieldSeparator);
        const { graph, hash } = splitGraphAndHash(prefix);
        const rawRefs = refs.trim();
        const timeRaw = time.trim();

        return {
            graph,
            hash,
            refs: compactRefs(rawRefs),
            subject: subject.trim(),
            timeRaw,
            timeRelative: formatRelativeTime(timeRaw),
            author: author.trim(),
            hasHead: rawRefs.includes("HEAD -> "),
        };
    };

    const graphIndent = (graph: string) => graph.replace(/[^ ]/g, " ");

    const entries = useMemo(() => logLines.map(parseLogLine), [logLines]);
    const maxGraphWidth = useMemo(() => {
        if (entries.length === 0) return 0;
        return Math.max(...entries.map((entry) => entry.graph.length));
    }, [entries]);

    const panelWidth = useMemo(() => {
        const totalWidth = dimensions.width || 80;
        return Math.max(24, Math.floor(totalWidth * 0.3));
    }, [dimensions.width]);

    const maxSubjectWidth = useMemo(() => {
        const reserved = maxGraphWidth + 10;
        return Math.max(18, panelWidth - reserved);
    }, [panelWidth, maxGraphWidth]);

    const truncateSubject = (subject: string, forceExpand: boolean) => {
        if (forceExpand || subject.length <= maxSubjectWidth) return subject;
        return `${subject.slice(0, Math.max(0, maxSubjectWidth - 3))}...`;
    };

    const truncateDetail = (text: string) => {
        const maxWidth = Math.max(12, panelWidth - 2);
        if (text.length <= maxWidth) return text;
        return `${text.slice(0, Math.max(0, maxWidth - 3))}...`;
    };

    const formatAbsoluteTime = (unixSecondsText: string) => {
        const unixSeconds = parseInt(unixSecondsText, 10);
        if (Number.isNaN(unixSeconds)) return "";
        const date = new Date(unixSeconds * 1000);
        return date.toISOString().replace("T", " ").slice(0, 16);
    };

    useEffect(() => {
        setSelectedIndex((current) => Math.min(Math.max(current, 0), Math.max(0, entries.length - 1)));
        if (expandedIndex !== null && expandedIndex >= entries.length) {
            setExpandedIndex(null);
        }
    }, [entries.length, expandedIndex]);

    useKeyboard((event) => {
        if (!focused) return;
        if (entries.length === 0) return;

        if (event.name === "up" || event.name === "k") {
            setSelectedIndex((current) => Math.max(0, current - 1));
        } else if (event.name === "down" || event.name === "j") {
            setSelectedIndex((current) => Math.min(entries.length - 1, current + 1));
        } else if (event.name === "e") {
            setExpandedIndex((current) => (current === selectedIndex ? null : selectedIndex));
        }
    });

    return (
        <box style={{ flexDirection: "column", border: true, borderColor, height: "100%", bg: "#0b0b0b" }} onMouseDown={onFocus}>
            <box style={{ paddingX: 1, height: 1, bg: "#1a1a1a", flexDirection: "row" }}>
                {focused && <text style={{ fg: "black", bg: "cyan", bold: true }}> FOCUS </text>}
                <text style={{ fg: "#d4a800", bold: true, bg: "#1a1a1a" }}>Git Graph</text>
                {focused && <text style={{ fg: "gray", dim: true, bg: "#1a1a1a" }}> j/k:move e:expand</text>}
            </box>
            <box style={{ flexDirection: "column", flexGrow: 1, bg: "#0b0b0b" }}>
                <scrollbox style={{ flexGrow: 1, paddingX: 1, bg: "#0b0b0b" }}>
                    {entries.length === 0 ? (
                        <text style={{ fg: "gray", dim: true, padding: 1 }}>No history found</text>
                    ) : (
                        entries.map((entry, idx) => {
                            const isSelected = idx === selectedIndex;
                            const selectionBg = isSelected ? "#1a1a1a" : undefined;
                            const graphDisplay = entry.graph.padEnd(maxGraphWidth, " ");
                            const indent = graphIndent(graphDisplay);
                            const showRefs = focused && entry.refs;
                            const subjectText = truncateSubject(entry.subject, expandedIndex === idx);

                            return (
                                <box key={idx} style={{ flexDirection: "column" }}>
                                    <box style={{ flexDirection: "row" }}>
                                        <text style={{ fg: "cyan", bg: selectionBg }}>{graphDisplay}</text>
                                        {entry.hasHead && <text style={{ fg: "#4ec9b0", bg: selectionBg, bold: true }}> *</text>}
                                        {entry.hash && <text style={{ fg: "#d4a800", bg: selectionBg, bold: true }}> {entry.hash}</text>}
                                        {entry.timeRelative && <text style={{ fg: "gray", bg: selectionBg, dim: true }}> - {entry.timeRelative}</text>}
                                    </box>
                                    {showRefs && (
                                        <box style={{ flexDirection: "row" }}>
                                            <text style={{ fg: "cyan", bg: selectionBg }}>{indent}</text>
                                            <text style={{ fg: "#4ec9b0", bg: selectionBg, dim: true }}> {entry.refs}</text>
                                        </box>
                                    )}
                                    {subjectText && (
                                        <box style={{ flexDirection: "row" }}>
                                            <text style={{ fg: "cyan", bg: selectionBg }}>{indent}</text>
                                            <text style={{ fg: "white", bg: selectionBg }}>  {subjectText}</text>
                                        </box>
                                    )}
                                </box>
                            );
                        })
                    )}
                </scrollbox>
                {entries[selectedIndex] && (
                    <box style={{ height: 1, paddingX: 1, bg: "#0b0b0b", flexShrink: 0 }}>
                        <text style={{ fg: "#2a2a2a" }}>
                            {"─".repeat(Math.max(1, panelWidth - 2))}
                        </text>
                    </box>
                )}
                {entries[selectedIndex] && (
                    <box style={{ flexDirection: "column", height: 4, paddingX: 1, bg: "#111111", flexShrink: 0 }}>
                        <text style={{ fg: focused ? "#d4a800" : "gray", bold: true }}>
                            {truncateDetail(
                                `${entries[selectedIndex].hash}${entries[selectedIndex].author ? ` - ${entries[selectedIndex].author}` : ""}`
                            )}
                        </text>
                        <text style={{ fg: focused ? "white" : "gray" }}>
                            {truncateDetail(entries[selectedIndex].subject || "No commit message")}
                        </text>
                        <text style={{ fg: "gray", dim: true }}>
                            {(() => {
                                const absolute = formatAbsoluteTime(entries[selectedIndex].timeRaw);
                                let timeText = entries[selectedIndex].timeRelative || "unknown";
                                if (absolute && panelWidth >= 36) {
                                    timeText = `${timeText} - ${absolute}`;
                                }
                                let line = `Time: ${timeText}`;
                                if (focused && entries[selectedIndex].refs) {
                                    line = `${line} - ${entries[selectedIndex].refs}`;
                                }
                                return truncateDetail(line);
                            })()}
                        </text>
                    </box>
                )}
            </box>
        </box>
    );
}
