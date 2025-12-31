import React, { useState, useRef, useEffect } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { FileTree } from "./components/FileTree";
import { FileViewer } from "./components/FileViewer";
import { Terminal } from "./components/Terminal";
import { FuzzyFinder } from "./components/FuzzyFinder";
import { CommandPalette } from "./components/CommandPalette";
import type { Command } from "./components/CommandPalette";
import { GlobalSearch } from "./components/GlobalSearch";
import { ThemePicker } from "./components/ThemePicker";
import { HelpPanel } from "./components/HelpPanel";
import { TabBar } from "./components/TabBar";
import { Notifications, useNotifications } from "./components/Notifications";
import * as path from "path";
import { getGitStatus, formatGitBranch, formatGitStatus, GitStatus, invalidateGitCache } from "./lib/GitIntegration";
import { Theme, DARK_THEME, THEMES } from "./lib/ThemeSystem";

type Panel = "tree" | "viewer" | "terminal";

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface AppProps {
  rootPath: string;
}

// Clipboard utilities - OSC52 for universal support + pbcopy fallback
function copyToClipboardOSC52(text: string): void {
  // OSC52 sequence: \x1b]52;c;<base64>\x07
  // Works in iTerm, Terminal.app, Kitty, Alacritty, tmux, and over SSH
  const base64 = Buffer.from(text).toString("base64");
  process.stdout.write(`\x1b]52;c;${base64}\x07`);
}

async function copyToClipboard(text: string): Promise<void> {
  // Try OSC52 first (works universally)
  copyToClipboardOSC52(text);
  // Also use pbcopy as backup for macOS
  try {
    const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
    proc.stdin.write(text);
    proc.stdin.end();
    await proc.exited;
  } catch { }
}

async function pasteFromClipboard(): Promise<string> {
  const proc = Bun.spawn(["pbpaste"], { stdout: "pipe" });
  const output = await new Response(proc.stdout).text();
  return output;
}

interface OpenTab {
  filePath: string;
  isDirty?: boolean;
}

export function App({ rootPath }: AppProps) {
  const [focusedPanel, setFocusedPanel] = useState<Panel>("tree");
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [clipboardContent, setClipboardContent] = useState<string>("");
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [showFuzzyFinder, setShowFuzzyFinder] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>(DARK_THEME);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [fileStats, setFileStats] = useState<{ size: number; lineCount: number } | null>(null);
  const dimensions = useTerminalDimensions();
  const { notifications, notify, dismiss, success, error } = useNotifications();

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Get currently selected file from active tab
  const selectedFile = openTabs[activeTabIndex]?.filePath || null;

  // Update file stats when file changes
  useEffect(() => {
    if (!selectedFile) {
      setFileStats(null);
      return;
    }

    const updateStats = async () => {
      try {
        const file = Bun.file(selectedFile);
        const size = file.size;
        const content = await file.text();
        const lineCount = content.split("\n").length;
        setFileStats({ size, lineCount });
      } catch {
        setFileStats(null);
      }
    };

    updateStats();
  }, [selectedFile]);

  // Add file to recent files when selected
  const addToRecentFiles = (filePath: string) => {
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f !== filePath);
      return [filePath, ...filtered].slice(0, 20); // Keep last 20
    });
  };
  const terminalPasteRef = useRef<((text: string) => void) | null>(null);
  const terminalCopyRef = useRef<(() => string) | null>(null);

  // Command palette commands
  const commands: Command[] = [
    // Navigation
    {
      id: "go-to-file",
      label: "Go to File",
      description: "Quick open a file",
      shortcut: "Ctrl+P",
      category: "Navigation",
      action: () => setShowFuzzyFinder(true),
    },
    {
      id: "search-in-files",
      label: "Search in Files",
      description: "Find text in all files",
      shortcut: "Ctrl+Shift+F",
      category: "Navigation",
      action: () => setShowGlobalSearch(true),
    },
    {
      id: "focus-explorer",
      label: "Focus Explorer",
      shortcut: "1",
      category: "Navigation",
      action: () => setFocusedPanel("tree"),
    },
    {
      id: "focus-editor",
      label: "Focus Editor",
      shortcut: "2",
      category: "Navigation",
      action: () => setFocusedPanel("viewer"),
    },
    {
      id: "focus-terminal",
      label: "Focus Terminal",
      shortcut: "3",
      category: "Navigation",
      action: () => setFocusedPanel("terminal"),
    },
    // Tab Operations
    {
      id: "close-tab",
      label: "Close Tab",
      description: "Close current tab",
      shortcut: "Ctrl+W",
      category: "Tabs",
      action: () => {
        if (openTabs.length > 0) {
          handleCloseTab(activeTabIndex);
        }
      },
    },
    {
      id: "close-all-tabs",
      label: "Close All Tabs",
      description: "Close all open tabs",
      category: "Tabs",
      action: () => {
        setOpenTabs([]);
        setActiveTabIndex(0);
      },
    },
    {
      id: "next-tab",
      label: "Next Tab",
      description: "Switch to next tab",
      shortcut: "Ctrl+Tab",
      category: "Tabs",
      action: () => {
        if (openTabs.length > 1) {
          setActiveTabIndex((i) => (i + 1) % openTabs.length);
        }
      },
    },
    {
      id: "prev-tab",
      label: "Previous Tab",
      description: "Switch to previous tab",
      category: "Tabs",
      action: () => {
        if (openTabs.length > 1) {
          setActiveTabIndex((i) => (i - 1 + openTabs.length) % openTabs.length);
        }
      },
    },
    // Git
    {
      id: "git-refresh",
      label: "Refresh Git Status",
      description: "Update git information",
      category: "Git",
      action: async () => {
        invalidateGitCache();
        const status = await getGitStatus(rootPath);
        setGitStatus(status);
      },
    },
    // View
    {
      id: "toggle-fullscreen-terminal",
      label: "Maximize Terminal",
      description: "Focus terminal panel",
      category: "View",
      action: () => setFocusedPanel("terminal"),
    },
    {
      id: "change-theme",
      label: "Change Color Theme",
      description: "Switch between color themes",
      category: "View",
      action: () => setShowThemePicker(true),
    },
    // Application
    {
      id: "show-help",
      label: "Show Keyboard Shortcuts",
      shortcut: "F1",
      category: "Application",
      action: () => setShowHelpPanel(true),
    },
    {
      id: "quit",
      label: "Quit Application",
      shortcut: "Ctrl+Q",
      category: "Application",
      action: () => process.exit(0),
    },
  ];

  // Fetch git status periodically
  useEffect(() => {
    const fetchGitStatus = async () => {
      const status = await getGitStatus(rootPath);
      setGitStatus(status);
    };

    fetchGitStatus();
    const interval = setInterval(fetchGitStatus, 5000); // Refresh every 5s

    return () => clearInterval(interval);
  }, [rootPath]);

  useKeyboard(async (event) => {
    // Don't handle keyboard if overlays are open (except help panel)
    if (showFuzzyFinder || showCommandPalette || showGlobalSearch || showThemePicker) return;

    // F1 - Toggle help panel
    if (event.name === "f1") {
      setShowHelpPanel((v) => !v);
      return;
    }

    // Don't handle other keys if help is open
    if (showHelpPanel) return;

    // Ctrl+Shift+F - Global search
    if (event.ctrl && event.shift && event.name === "f") {
      setShowGlobalSearch(true);
      return;
    }

    // Ctrl+Shift+P - Open command palette
    if (event.ctrl && event.shift && event.name === "p") {
      setShowCommandPalette(true);
      return;
    }

    // Ctrl+P - Open fuzzy finder
    if (event.ctrl && event.name === "p") {
      setShowFuzzyFinder(true);
      return;
    }

    // Ctrl+W - Close current tab
    if (event.ctrl && event.name === "w") {
      if (openTabs.length > 0) {
        handleCloseTab(activeTabIndex);
      }
      return;
    }

    // Alt+number - Switch to tab
    if (event.meta && event.name && /^[1-9]$/.test(event.name)) {
      const tabIndex = parseInt(event.name) - 1;
      if (tabIndex < openTabs.length) {
        setActiveTabIndex(tabIndex);
        setFocusedPanel("viewer");
      }
      return;
    }

    // Ctrl+Tab - Next tab (when in viewer)
    if (event.ctrl && event.name === "tab" && !event.shift && focusedPanel === "viewer") {
      if (openTabs.length > 1) {
        setActiveTabIndex((i) => (i + 1) % openTabs.length);
      }
      return;
    }

    // Don't intercept Cmd+key - let terminal host handle copy/paste
    // Use Ctrl+Shift+C to copy entire panel content (Linux terminal standard)
    if (event.ctrl && event.shift && event.name === "c") {
      try {
        if (focusedPanel === "viewer" && selectedFile) {
          const content = await Bun.file(selectedFile).text();
          await copyToClipboard(content);
          success("Copied file content", 2000);
        } else if (focusedPanel === "terminal" && terminalCopyRef.current) {
          const content = terminalCopyRef.current();
          await copyToClipboard(content);
          success("Copied terminal content", 2000);
        }
      } catch {
        error("Failed to copy", 2000);
      }
      return;
    }

    // Ctrl+Shift+V to paste to terminal
    if (event.ctrl && event.shift && event.name === "v") {
      if (focusedPanel === "terminal" && terminalPasteRef.current) {
        const text = await pasteFromClipboard();
        terminalPasteRef.current(text);
        success("Pasted to terminal", 2000);
      }
      return;
    }

    // Global keybindings
    if (event.ctrl && event.name === "q") {
      process.exit(0);
    }

    // Panel navigation with Tab
    if (event.name === "tab" && !event.shift) {
      setFocusedPanel((current) => {
        const order: Panel[] = ["tree", "viewer", "terminal"];
        const currentIndex = order.indexOf(current);
        return order[(currentIndex + 1) % order.length] as Panel;
      });
    } else if (event.name === "tab" && event.shift) {
      setFocusedPanel((current) => {
        const order: Panel[] = ["tree", "viewer", "terminal"];
        const currentIndex = order.indexOf(current);
        return order[(currentIndex - 1 + order.length) % order.length] as Panel;
      });
    }

    // Number shortcuts
    if (event.name === "1") setFocusedPanel("tree");
    if (event.name === "2") setFocusedPanel("viewer");
    if (event.name === "3") setFocusedPanel("terminal");
  });

  // Open file in a new tab or switch to existing tab
  const handleFileSelect = (filePath: string) => {
    // Check if file is already open
    const existingIndex = openTabs.findIndex((tab) => tab.filePath === filePath);

    if (existingIndex !== -1) {
      // Switch to existing tab
      setActiveTabIndex(existingIndex);
    } else {
      // Open in new tab
      setOpenTabs((tabs) => [...tabs, { filePath, isDirty: false }]);
      setActiveTabIndex(openTabs.length);
    }

    setFocusedPanel("viewer");
    addToRecentFiles(filePath);
  };

  // Close a tab
  const handleCloseTab = (index: number) => {
    setOpenTabs((tabs) => {
      const newTabs = tabs.filter((_, i) => i !== index);
      // Adjust active tab if needed
      if (activeTabIndex >= newTabs.length) {
        setActiveTabIndex(Math.max(0, newTabs.length - 1));
      } else if (index < activeTabIndex) {
        setActiveTabIndex(activeTabIndex - 1);
      }
      return newTabs;
    });
  };

  const treeWidth = 30;
  const mainWidth = (dimensions.width || 80) - treeWidth - 4;
  const totalHeight = (dimensions.height || 40) - 7; // -7 for taller header and status bar
  const viewerHeight = Math.floor(totalHeight * 0.4); // 40% for viewer
  const terminalHeight = totalHeight - viewerHeight; // 60% for terminal

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%", bg: "#050505" }}>
      {/* Header */}
      <box style={{ paddingX: 1, paddingY: 1, flexDirection: "row", gap: 3, height: 5 }}>
        <text style={{ fg: "cyan", bold: true }}>
          {`▀█▀ █▀▀ █▀▄ █▄▀▄█ █ █▀▄ █▀▀
 █  █▀▀ █▀▄ █ █ █ █ █ █ █▀▀
 ▀  ▀▀▀ ▀ ▀ ▀   ▀ ▀ ▀▀  ▀▀▀`}
        </text>
        <box style={{ flexDirection: "column", justifyContent: "center" }}>
          <text style={{ fg: "white", bold: true }}>TERMINAL IDE</text>
          <text style={{ fg: "gray" }}>{rootPath.replace(process.env.HOME || "", "~")}</text>
          <text style={{ fg: "gray", dim: true }}>Tab: switch | Ctrl+P: find | F1: help | Ctrl+Q: quit</text>
        </box>
      </box>

      {/* Main content */}
      <box style={{ flexGrow: 1, flexDirection: "row" }}>
        {/* File Tree - Left panel */}
        <box style={{ width: treeWidth }}>
          <FileTree
            rootPath={rootPath}
            onFileSelect={handleFileSelect}
            focused={focusedPanel === "tree"}
          />
        </box>

        {/* Right side - Tabs + Viewer + Terminal */}
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          {/* Tab Bar */}
          {openTabs.length > 0 && (
            <TabBar
              tabs={openTabs}
              activeTabIndex={activeTabIndex}
              onSelectTab={setActiveTabIndex}
              onCloseTab={handleCloseTab}
              focused={focusedPanel === "viewer"}
            />
          )}

          {/* File Viewer - Top right (40%) */}
          <box style={{ flexGrow: 2 }}>
            <FileViewer
              filePath={selectedFile}
              focused={focusedPanel === "viewer"}
              rootPath={rootPath}
            />
          </box>

          {/* Terminal - Bottom (60% height) */}
          <box style={{ flexGrow: 3 }}>
            <Terminal
              cwd={rootPath}
              focused={focusedPanel === "terminal"}
              onFocusRequest={() => setFocusedPanel("terminal")}
              onPasteReady={(pasteFn) => { terminalPasteRef.current = pasteFn; }}
              onCopyReady={(copyFn) => { terminalCopyRef.current = copyFn; }}
              height={terminalHeight}
            />
          </box>
        </box>
      </box>

      {/* Status bar */}
      <box style={{ paddingX: 1, bg: "black", justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row" }}>
          {/* Git branch */}
          {gitStatus?.isRepo && (
            <>
              <text style={{ fg: "magenta", bold: true }}></text>
              <text style={{ fg: "magenta" }}>{formatGitBranch(gitStatus)}</text>
              <text style={{ fg: gitStatus.clean ? "green" : "yellow" as any }}>
                {" "}{formatGitStatus(gitStatus)}
              </text>
              <text style={{ fg: "gray" }}> │ </text>
            </>
          )}
          {/* File path */}
          <text style={{ fg: "yellow" }}>
            {selectedFile ? path.relative(rootPath, selectedFile) : "No file"}
          </text>
          {/* File stats */}
          {fileStats && (
            <>
              <text style={{ fg: "gray" }}> │ </text>
              <text style={{ fg: "gray", dim: true }}>
                {fileStats.lineCount} lines, {formatFileSize(fileStats.size)}
              </text>
            </>
          )}
        </box>
        <box style={{ flexDirection: "row", gap: 2 }}>
          {/* Clock */}
          <text style={{ fg: "gray", dim: true }}>
            {currentTime.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
          </text>
          {/* Panel indicator */}
          <box style={{ flexDirection: "row" }}>
            <text style={{ fg: "gray" }}>[</text>
            <text style={{ fg: focusedPanel === "tree" ? "cyan" : "gray" as any, bold: focusedPanel === "tree" }}>1</text>
            <text style={{ fg: "gray" }}>:</text>
            <text style={{ fg: focusedPanel === "viewer" ? "cyan" : "gray" as any, bold: focusedPanel === "viewer" }}>2</text>
            <text style={{ fg: "gray" }}>:</text>
            <text style={{ fg: focusedPanel === "terminal" ? "cyan" : "gray" as any, bold: focusedPanel === "terminal" }}>3</text>
            <text style={{ fg: "gray" }}>]</text>
          </box>
        </box>
      </box>

      {/* Overlays */}
      {showFuzzyFinder && (
        <FuzzyFinder
          rootPath={rootPath}
          isOpen={showFuzzyFinder}
          onClose={() => setShowFuzzyFinder(false)}
          onSelect={handleFileSelect}
          recentFiles={recentFiles}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          isOpen={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          commands={commands}
        />
      )}

      {showGlobalSearch && (
        <GlobalSearch
          rootPath={rootPath}
          isOpen={showGlobalSearch}
          onClose={() => setShowGlobalSearch(false)}
          onSelect={(filePath, lineNumber) => {
            handleFileSelect(filePath);
            success(`Opened ${path.basename(filePath)}`, 2000);
          }}
        />
      )}

      {showThemePicker && (
        <ThemePicker
          isOpen={showThemePicker}
          onClose={() => setShowThemePicker(false)}
          currentTheme={currentTheme}
          onSelect={(theme) => {
            setCurrentTheme(theme);
            success(`Theme: ${theme.name}`, 2000);
          }}
        />
      )}

      {showHelpPanel && (
        <HelpPanel
          isOpen={showHelpPanel}
          onClose={() => setShowHelpPanel(false)}
        />
      )}

      {/* Notifications */}
      <Notifications
        notifications={notifications}
        onDismiss={dismiss}
      />
    </box>
  );
}
