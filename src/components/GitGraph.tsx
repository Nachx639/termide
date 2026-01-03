import React, { useState, useEffect, useCallback } from "react";
import { getGitLog } from "../lib/GitIntegration";

interface GitGraphProps {
    rootPath: string;
    focused: boolean;
    onFocus?: () => void;
}

export function GitGraph({ rootPath, focused, onFocus }: GitGraphProps) {
    const [logLines, setLogLines] = useState<string[]>([]);

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

    return (
        <box style={{ flexDirection: "column", border: true, borderColor, height: "100%", bg: "#0b0b0b" }} onMouseDown={onFocus}>
            <box style={{ paddingX: 1, height: 1, bg: "#1a1a1a" }}>
                <text style={{ fg: "magenta", bold: true, bg: "#1a1a1a" }}>Git Graph</text>
            </box>
            <scrollbox style={{ flexDirection: "column", flexGrow: 1, paddingX: 1, bg: "#0b0b0b" }}>
                {logLines.length === 0 ? (
                    <text style={{ fg: "gray", dim: true, padding: 1 }}>No history found</text>
                ) : (
                    logLines.map((line, idx) => {
                        // Simple coloring for the graph parts vs text parts
                        // Git --graph uses characters like *, |, /, \, _
                        const graphChars = /[*|/\\ _-]/;
                        let firstTextIdx = line.search(/[0-9a-f]/);
                        if (firstTextIdx === -1) firstTextIdx = line.length;

                        const graphPart = line.slice(0, firstTextIdx);
                        const textPart = line.slice(firstTextIdx);

                        return (
                            <box key={idx} style={{ flexDirection: "row" }}>
                                <text style={{ fg: "cyan" }}>{graphPart}</text>
                                <text style={{ fg: "white" }}>{textPart}</text>
                            </box>
                        );
                    })
                )}
            </scrollbox>
        </box>
    );
}
