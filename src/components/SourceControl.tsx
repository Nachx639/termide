import React, { useState, useEffect, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import {
    getGitChanges,
    type FileGitStatus,
    getFileStatusColor,
    getFileStatusIcon,
    stageFile,
    unstageFile,
    stageAllFiles,
    unstageAllFiles,
    createCommit,
    getFileDiff,
    discardFileChanges,
} from "../lib/GitIntegration";

interface SourceControlProps {
    rootPath: string;
    focused: boolean;
    onFocus?: () => void;
    onShowDiff?: (diff: string, filePath: string) => void;
}

export function SourceControl({ rootPath, focused, onFocus, onShowDiff }: SourceControlProps) {
    const [changes, setChanges] = useState<{ path: string; status: FileGitStatus }[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showCommitModal, setShowCommitModal] = useState(false);
    const [commitMessage, setCommitMessage] = useState("");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const updateChanges = useCallback(async () => {
        const gitChanges = await getGitChanges(rootPath);
        setChanges(gitChanges);
    }, [rootPath]);

    useEffect(() => {
        updateChanges();
        const interval = setInterval(updateChanges, 3000);
        return () => clearInterval(interval);
    }, [updateChanges]);

    // Clear status message after 2 seconds
    useEffect(() => {
        if (statusMessage) {
            const timer = setTimeout(() => setStatusMessage(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    const handleStageToggle = async () => {
        const selected = changes[selectedIndex];
        if (!selected) return;

        if (selected.status.staged) {
            await unstageFile(selected.path, rootPath);
            setStatusMessage(`Unstaged: ${selected.path}`);
        } else {
            await stageFile(selected.path, rootPath);
            setStatusMessage(`Staged: ${selected.path}`);
        }
        await updateChanges();
    };

    const handleStageAll = async () => {
        await stageAllFiles(rootPath);
        setStatusMessage("Staged all changes");
        await updateChanges();
    };

    const handleUnstageAll = async () => {
        await unstageAllFiles(rootPath);
        setStatusMessage("Unstaged all changes");
        await updateChanges();
    };

    const handleShowDiff = async () => {
        const selected = changes[selectedIndex];
        if (!selected || !onShowDiff) return;

        const diff = await getFileDiff(selected.path, rootPath, selected.status.staged);
        if (diff) {
            onShowDiff(diff, selected.path);
        }
    };

    const handleDiscard = async () => {
        const selected = changes[selectedIndex];
        if (!selected || selected.status.staged) return;

        await discardFileChanges(selected.path, rootPath);
        setStatusMessage(`Discarded: ${selected.path}`);
        await updateChanges();
    };

    const handleCommit = async () => {
        if (!commitMessage.trim()) return;
        const success = await createCommit(commitMessage, rootPath);
        if (success) {
            setStatusMessage("Committed successfully!");
            setCommitMessage("");
            setShowCommitModal(false);
            await updateChanges();
        } else {
            setStatusMessage("Commit failed!");
        }
    };

    useKeyboard((event) => {
        if (!focused) return;

        // Commit modal handling
        if (showCommitModal) {
            if (event.name === "escape") {
                setShowCommitModal(false);
                setCommitMessage("");
                return;
            }
            if (event.name === "return" && event.ctrl) {
                handleCommit();
                return;
            }
            if (event.name === "backspace") {
                setCommitMessage((msg) => msg.slice(0, -1));
                return;
            }
            // Handle regular character input
            if (event.sequence && event.sequence.length === 1 && !event.ctrl && !event.meta) {
                setCommitMessage((msg) => msg + event.sequence);
                return;
            }
            // Handle space
            if (event.name === "space") {
                setCommitMessage((msg) => msg + " ");
                return;
            }
            return;
        }

        if (event.name === "up" || event.name === "k") {
            setSelectedIndex((i) => Math.max(0, i - 1));
        } else if (event.name === "down" || event.name === "j") {
            setSelectedIndex((i) => Math.min(changes.length - 1, i + 1));
        } else if (event.name === "s") {
            // Stage/Unstage selected file
            handleStageToggle();
        } else if (event.name === "S" || (event.name === "a" && event.shift)) {
            // Stage all
            handleStageAll();
        } else if (event.name === "u") {
            // Unstage selected
            const selected = changes[selectedIndex];
            if (selected?.status.staged) {
                unstageFile(selected.path, rootPath).then(() => {
                    setStatusMessage(`Unstaged: ${selected.path}`);
                    updateChanges();
                });
            }
        } else if (event.name === "U") {
            // Unstage all
            handleUnstageAll();
        } else if (event.name === "return" || event.name === "d") {
            // Show diff
            handleShowDiff();
        } else if (event.name === "x") {
            // Discard changes
            handleDiscard();
        } else if (event.name === "c") {
            // Open commit modal
            const staged = changes.filter(c => c.status.staged);
            if (staged.length > 0) {
                setShowCommitModal(true);
            } else {
                setStatusMessage("No staged changes to commit");
            }
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
                {focused && (
                    <text style={{ fg: "gray", dim: true, bg: "#1a1a1a" }}> s:stage c:commit x:discard</text>
                )}
            </box>

            {/* Status message */}
            {statusMessage && (
                <box style={{ paddingX: 1, height: 1, bg: "#2a2a2a" }}>
                    <text style={{ fg: "#4ec9b0", bold: true }}>{statusMessage}</text>
                </box>
            )}

            {/* Commit modal */}
            {showCommitModal && (
                <box style={{ flexDirection: "column", paddingX: 1, paddingY: 1, bg: "#1e1e1e", border: true, borderColor: "cyan" }}>
                    <text style={{ fg: "cyan", bold: true }}>Commit Message</text>
                    <box style={{ height: 1 }} />
                    <box style={{ flexDirection: "row", bg: "#2a2a2a", paddingX: 1 }}>
                        <text style={{ fg: "white" }}>{commitMessage || " "}</text>
                        <text style={{ fg: "cyan", bold: true }}>│</text>
                    </box>
                    <box style={{ height: 1 }} />
                    <text style={{ fg: "gray", dim: true }}>Ctrl+Enter to commit, Esc to cancel</text>
                    <box style={{ flexDirection: "row", marginTop: 1 }}>
                        <text style={{ fg: "green" }}>Staged: {staged.length} files</text>
                    </box>
                </box>
            )}

            <box style={{ flexDirection: "column", flexGrow: 1, bg: "#0b0b0b" }}>
                <scrollbox style={{ flexGrow: 1, paddingX: 1, bg: "#0b0b0b" }}>
                {changes.length === 0 ? (
                    <text style={{ fg: "gray", dim: true, padding: 1 }}>No changes detected</text>
                ) : (
                    <>
                        {staged.length > 0 && (
                            <box style={{ flexDirection: "column", marginBottom: 1 }}>
                                <box style={{ flexDirection: "row" }}>
                                    <text style={{ fg: "green", bold: true }}>✓ Staged Changes ({staged.length})</text>
                                    {focused && <text style={{ fg: "gray", dim: true }}> [u:unstage U:unstage all]</text>}
                                </box>
                                {staged.map((change, idx) => {
                                    const isSelected = changes.indexOf(change) === selectedIndex && focused;
                                    return (
                                        <box key={`staged-${change.path}`} style={{ flexDirection: "row", bg: isSelected ? "blue" : undefined as any }}>
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
                                <box style={{ flexDirection: "row" }}>
                                    <text style={{ fg: "#d4a800", bold: true }}>○ Changes ({unstaged.length})</text>
                                    {focused && <text style={{ fg: "gray", dim: true }}> [s:stage S:stage all]</text>}
                                </box>
                                {unstaged.map((change, idx) => {
                                    const isSelected = changes.indexOf(change) === selectedIndex && focused;
                                    return (
                                        <box key={`unstaged-${change.path}`} style={{ flexDirection: "row", bg: isSelected ? "blue" : undefined as any }}>
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
