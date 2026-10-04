import React, { useState, useEffect, useCallback } from "react";
import { useTheme } from "../lib/themeContext";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
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
import { setKeyCapture } from "../lib/keyCapture";

interface SourceControlProps {
    rootPath: string;
    focused: boolean;
    onFocus?: () => void;
    onShowDiff?: (diff: string, filePath: string) => void;
}

export function SourceControl({ rootPath, focused, onFocus, onShowDiff }: SourceControlProps) {
    const theme = useTheme();
    const [changes, setChanges] = useState<{ path: string; status: FileGitStatus }[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showCommitModal, setShowCommitModal] = useState(false);
    const [commitMessage, setCommitMessage] = useState("");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // The commit message input keeps every key while it is open.
    useEffect(() => {
        setKeyCapture("commit-message", showCommitModal);
        return () => setKeyCapture("commit-message", false);
    }, [showCommitModal]);

    // Pending discard (x pressed once): path + when, confirmed by a second x.
    const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);
    const scrollRef = React.useRef<any>(null);

    const updateChanges = useCallback(async () => {
        const gitChanges = await getGitChanges(rootPath);
        // Same order as on screen (staged group first), so arrow keys walk the
        // list top to bottom instead of jumping around in git's order.
        const ordered = [...gitChanges.filter((c) => c.status.staged), ...gitChanges.filter((c) => !c.status.staged)];
        setChanges(ordered);
        setSelectedIndex((i) => Math.min(i, Math.max(0, ordered.length - 1)));
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

    // Discarding cannot be undone: it needs a second x on the same file.
    const handleDiscard = async () => {
        const selected = changes[selectedIndex];
        if (!selected || selected.status.staged) return;
        if (selected.status.status === "?") {
            setStatusMessage("Untracked file: delete it from the Explorer instead");
            return;
        }
        if (pendingDiscard !== selected.path) {
            setPendingDiscard(selected.path);
            setStatusMessage(`x again to discard changes in ${selected.path} (cannot be undone)`);
            return;
        }
        setPendingDiscard(null);
        const ok = await discardFileChanges(selected.path, rootPath);
        setStatusMessage(ok ? `Discarded: ${selected.path}` : `Could not discard ${selected.path}`);
        await updateChanges();
    };

    useEffect(() => {
        if (!pendingDiscard) return;
        const t = setTimeout(() => setPendingDiscard(null), 3000);
        return () => clearTimeout(t);
    }, [pendingDiscard]);

    const handleCommit = async (submitted?: string) => {
        const message = (submitted ?? commitMessage).trim();
        if (!message) return;
        const success = await createCommit(message, rootPath);
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

        // Commit modal: the message is a native <input> (Enter commits). Ctrl+Enter
        // used to be required, which most terminals cannot tell apart from Enter,
        // so Enter typed a "\r" into the message and committing was impossible.
        if (showCommitModal) {
            if (event.name === "escape") {
                setShowCommitModal(false);
                setCommitMessage("");
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
        } else if (event.name === "x" && !event.ctrl) {
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

    useEffect(() => {
        try {
            scrollRef.current?.scrollChildIntoView(`sc:${selectedIndex}`);
        } catch {}
    }, [selectedIndex, changes.length]);

    // One line per file: name first, then its folder dimmed (long paths used to
    // wrap onto two lines). A single <text> per row also avoids OpenTUI leaving
    // a newly inserted keyed row blank.
    const renderChangeRow = (change: { path: string; status: FileGitStatus }, isSelected: boolean) => {
        const slash = change.path.lastIndexOf("/");
        const name = slash === -1 ? change.path : change.path.slice(slash + 1);
        const dir = slash === -1 ? "" : change.path.slice(0, slash);
        return (
            <text wrapMode="none" style={{ fg: isSelected ? "cyan" : "white" }}>
                <span fg={getFileStatusColor(change.status) as any}>{getFileStatusIcon(change.status)}</span>
                {` ${name}`}
                {dir ? <span fg="gray">{`  ${dir}`}</span> : null}
            </text>
        );
    };

    const borderColor = focused ? theme.borderFocused : theme.border;

    // Group changes
    const staged = changes.filter(c => c.status.staged);
    const unstaged = changes.filter(c => !c.status.staged);

    const bottomTitle =
        changes.length === 0 ? " clean " : ` ${staged.length} staged · ${unstaged.length} unstaged `;

    return (
        <box
            style={{ flexDirection: "column", border: true, borderColor, height: "100%", backgroundColor: "#0b0b0b" }}
            bottomTitle={bottomTitle}
            bottomTitleAlignment="right"
            onMouseDown={onFocus}
        >
            <box style={{ paddingX: 1, height: 1, backgroundColor: "#1a1a1a", flexDirection: "row" }}>
                {focused && <text style={{ fg: "black", bg: theme.accent, attributes: TextAttributes.BOLD, flexShrink: 0 }}> FOCUS </text>}
                <text wrapMode="none" style={{ fg: "cyan", attributes: TextAttributes.BOLD, bg: "#1a1a1a", flexShrink: 0 }}>{focused ? " Source Control" : "Source Control"}</text>
                {focused && (
                    <text wrapMode="none" style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#1a1a1a", flexShrink: 1 }}> s:stage c:commit x:discard</text>
                )}
            </box>

            {/* Status message */}
            {statusMessage && (
                <box style={{ paddingX: 1, height: 1, backgroundColor: "#2a2a2a" }}>
                    <text style={{ fg: "#4ec9b0", attributes: TextAttributes.BOLD }}>{statusMessage}</text>
                </box>
            )}

            {/* Commit modal */}
            {showCommitModal && (
                <box style={{ flexDirection: "column", paddingX: 1, paddingY: 1, backgroundColor: "#1e1e1e", border: true, borderColor: "cyan" }}>
                    <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>Commit Message</text>
                    <box style={{ height: 1 }} />
                    <box style={{ flexDirection: "row", backgroundColor: "#2a2a2a", paddingX: 1, height: 1 }}>
                        <input
                            focused={focused && showCommitModal}
                            value={commitMessage}
                            placeholder="Describe the change…"
                            onInput={(v: string) => setCommitMessage(v)}
                            onSubmit={(v: any) => handleCommit(typeof v === "string" ? v : undefined)}
                            style={{ flexGrow: 1, backgroundColor: "#2a2a2a", textColor: "white", placeholderColor: "gray", cursorColor: "cyan" }}
                        />
                    </box>
                    <box style={{ height: 1 }} />
                    <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>Enter to commit, Esc to cancel</text>
                    <box style={{ flexDirection: "row", marginTop: 1 }}>
                        <text style={{ fg: "green" }}>Staged: {staged.length} files</text>
                    </box>
                </box>
            )}

            <box style={{ flexDirection: "column", flexGrow: 1, backgroundColor: "#0b0b0b" }}>
                <scrollbox ref={scrollRef} style={{ flexGrow: 1, paddingX: 1, backgroundColor: "#0b0b0b" }}>
                {changes.length === 0 ? (
                    <text style={{ fg: "gray", attributes: TextAttributes.DIM, padding: 1 } as any}>No changes detected</text>
                ) : (
                    <>
                        {staged.length > 0 && (
                            <box style={{ flexDirection: "column", marginBottom: 1 }}>
                                <box style={{ flexDirection: "row" }}>
                                    <text wrapMode="none" style={{ fg: "green", attributes: TextAttributes.BOLD, flexShrink: 0 }}>✓ Staged ({staged.length})</text>
                                    {focused && <text wrapMode="none" style={{ fg: "gray", attributes: TextAttributes.DIM, flexShrink: 1 }}> u:unstage U:all</text>}
                                </box>
                                {staged.map((change, idx) => {
                                    const isSelected = changes.indexOf(change) === selectedIndex && focused;
                                    return (
                                        <box key={`staged-${change.path}`} id={`sc:${changes.indexOf(change)}`} style={{ flexDirection: "row", backgroundColor: isSelected ? "blue" : undefined as any }}>
                                            {renderChangeRow(change, isSelected)}
                                        </box>
                                    );
                                })}
                            </box>
                        )}
                        {unstaged.length > 0 && (
                            <box style={{ flexDirection: "column" }}>
                                <box style={{ flexDirection: "row" }}>
                                    <text wrapMode="none" style={{ fg: "#d4a800", attributes: TextAttributes.BOLD, flexShrink: 0 }}>○ Changes ({unstaged.length})</text>
                                    {focused && <text wrapMode="none" style={{ fg: "gray", attributes: TextAttributes.DIM, flexShrink: 1 }}> s:stage S:all</text>}
                                </box>
                                {unstaged.map((change, idx) => {
                                    const isSelected = changes.indexOf(change) === selectedIndex && focused;
                                    return (
                                        <box key={`unstaged-${change.path}`} id={`sc:${changes.indexOf(change)}`} style={{ flexDirection: "row", backgroundColor: isSelected ? "blue" : undefined as any }}>
                                            {renderChangeRow(change, isSelected)}
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
