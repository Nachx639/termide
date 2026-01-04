import React, { useState, useEffect, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import { getGitChanges, type FileGitStatus, getFileStatusColor, getFileStatusIcon } from "../lib/GitIntegration";

interface SourceControlProps {
    rootPath: string;
    focused: boolean;
    onFocus?: () => void;
}

export function SourceControl({ rootPath, focused, onFocus }: SourceControlProps) {
    const [changes, setChanges] = useState<{ path: string; status: FileGitStatus }[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const updateChanges = useCallback(async () => {
        const gitChanges = await getGitChanges(rootPath);
        setChanges(gitChanges);
    }, [rootPath]);

    useEffect(() => {
        updateChanges();
        const interval = setInterval(updateChanges, 5000);
        return () => clearInterval(interval);
    }, [updateChanges]);

    useKeyboard((event) => {
        if (!focused) return;

        if (event.name === "up" || event.name === "k") {
            setSelectedIndex((i) => Math.max(0, i - 1));
        } else if (event.name === "down" || event.name === "j") {
            setSelectedIndex((i) => Math.min(changes.length - 1, i + 1));
        }
    });

    const borderColor = focused ? "cyan" : "gray";

    // Group changes
    const staged = changes.filter(c => c.status.staged);
    const unstaged = changes.filter(c => !c.status.staged);

    return (
        <box style={{ flexDirection: "column", border: true, borderColor, height: "100%", bg: "#0b0b0b" }} onMouseDown={onFocus}>
            <box style={{ paddingX: 1, height: 1, bg: "#1a1a1a", flexDirection: "row" }}>
                {focused && <text style={{ fg: "black", bg: "cyan", bold: true }}> FOCUS </text>}
                <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a" }}>Source Control</text>
            </box>
            <box style={{ flexDirection: "column", flexGrow: 1, bg: "#0b0b0b" }}>
                <scrollbox style={{ flexGrow: 1, paddingX: 1, bg: "#0b0b0b" }}>
                {changes.length === 0 ? (
                    <text style={{ fg: "gray", dim: true, padding: 1 }}>No changes detected</text>
                ) : (
                    <>
                        {staged.length > 0 && (
                            <box style={{ flexDirection: "column", marginBottom: 1 }}>
                                <text style={{ fg: "green", bold: true }}>Staged Changes ({staged.length})</text>
                                {staged.map((change, idx) => {
                                    const isSelected = changes.indexOf(change) === selectedIndex && focused;
                                    return (
                                        <box key={change.path} style={{ flexDirection: "row", bg: isSelected ? "blue" : undefined as any }}>
                                            <text style={{ fg: getFileStatusColor(change.status) as any }}>
                                                {getFileStatusIcon(change.status)}
                                            </text>
                                            <text style={{ fg: isSelected ? "cyan" : "white" as any }}> {change.path}</text>
                                        </box>
                                    );
                                })}
                            </box>
                        )}
                        {unstaged.length > 0 && (
                            <box style={{ flexDirection: "column" }}>
                                <text style={{ fg: "#d4a800", bold: true }}>Changes ({unstaged.length})</text>
                                {unstaged.map((change, idx) => {
                                    const isSelected = changes.indexOf(change) === selectedIndex && focused;
                                    return (
                                        <box key={change.path} style={{ flexDirection: "row", bg: isSelected ? "blue" : undefined as any }}>
                                            <text style={{ fg: getFileStatusColor(change.status) as any }}>
                                                {getFileStatusIcon(change.status)}
                                            </text>
                                            <text style={{ fg: isSelected ? "cyan" : "white" as any }}> {change.path}</text>
                                        </box>
                                    );
                                })}
                            </box>
                        )}
                    </>
                )}
                </scrollbox>
            </box>
        </box>
    );
}
