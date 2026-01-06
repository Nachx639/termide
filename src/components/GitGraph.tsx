import React, { useState, useEffect, useCallback } from "react";
import { getGitLog } from "../lib/GitIntegration";

interface GitGraphProps {
    rootPath: string;
    focused: boolean;
    onFocus?: () => void;
}

export function GitGraph({ rootPath, focused, onFocus }: GitGraphProps) {
    const [logLines, setLogLines] = useState<string[]>([]);
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

    const compactRelativeTime = (time: string) => {
        const match = time.match(/(\d+)\s+(second|minute|hour|day|week|month|year)/);
        if (!match) return time;
        const value = match[1];
        const unit = match[2];
        const suffixMap: Record<string, string> = {
            second: "s",
            minute: "m",
            hour: "h",
            day: "d",
            week: "w",
            month: "mo",
            year: "y",
        };
        return `${value}${suffixMap[unit] || ""}`;
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
        if (headTarget) tokens.push(`HEAD→${headTarget}`);
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
            return { graph: line, hash: "", refs: "", subject: "", time: "" };
        }

        const graph = line.slice(0, firstHashIdx);
        const textPart = line.slice(firstHashIdx).trim();
        const match = textPart.match(/^([0-9a-f]+)\s+(.*?)(?:\s+\((.+)\))?$/);

        if (!match) {
            return { graph, hash: "", refs: "", subject: textPart, time: "" };
        }

        return {
            graph,
            hash: match[1] || "",
            refs: "",
            subject: match[2] || "",
            time: match[3] || "",
        };
    };

    const parseLogLine = (line: string) => {
        if (!line.includes(fieldSeparator)) {
            return parseLegacyLine(line);
        }

        const [prefix, refs = "", subject = "", time = ""] = line.split(fieldSeparator);
        const { graph, hash } = splitGraphAndHash(prefix);

        return {
            graph,
            hash,
            refs: compactRefs(refs.trim()),
            subject: subject.trim(),
            time: compactRelativeTime(time.trim()),
        };
    };

    const graphIndent = (graph: string) => graph.replace(/[^ ]/g, " ");

    return (
        <box style={{ flexDirection: "column", border: true, borderColor, height: "100%", bg: "#0b0b0b" }} onMouseDown={onFocus}>
            <box style={{ paddingX: 1, height: 1, bg: "#1a1a1a", flexDirection: "row" }}>
                {focused && <text style={{ fg: "black", bg: "cyan", bold: true }}> FOCUS </text>}
                <text style={{ fg: "#d4a800", bold: true, bg: "#1a1a1a" }}>Git Graph</text>
            </box>
            <box style={{ flexDirection: "column", flexGrow: 1, bg: "#0b0b0b" }}>
                <scrollbox style={{ flexGrow: 1, paddingX: 1, bg: "#0b0b0b" }}>
                    {logLines.length === 0 ? (
                        <text style={{ fg: "gray", dim: true, padding: 1 }}>No history found</text>
                    ) : (
                        logLines.map((line, idx) => {
                            const entry = parseLogLine(line);
                            const indent = graphIndent(entry.graph);

                            return (
                                <box key={idx} style={{ flexDirection: "column" }}>
                                    <box style={{ flexDirection: "row" }}>
                                        <text style={{ fg: "cyan" }}>{entry.graph}</text>
                                        {entry.hash && <text style={{ fg: "#d4a800", bold: true }}>{entry.hash}</text>}
                                        {entry.refs && <text style={{ fg: "#4ec9b0", dim: true }}> {entry.refs}</text>}
                                        {entry.time && <text style={{ fg: "gray", dim: true }}> · {entry.time}</text>}
                                    </box>
                                    {entry.subject && (
                                        <box style={{ flexDirection: "row" }}>
                                            <text style={{ fg: "cyan" }}>{indent}</text>
                                            <text style={{ fg: "white" }}>  {entry.subject}</text>
                                        </box>
                                    )}
                                </box>
                            );
                        })
                    )}
                </scrollbox>
            </box>
        </box>
    );
}
