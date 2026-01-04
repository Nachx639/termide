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
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { TabBar } from "./components/TabBar";
import { SourceControl } from "./components/SourceControl";
import { GitGraph } from "./components/GitGraph";
import { AgentPanel } from "./components/AgentPanel";
import { Notifications, useNotifications } from "./components/Notifications";
import { MiniMode } from "./components/MiniMode";
import { CompactHeader } from "./components/CompactHeader";
import { FileOperationsModal, type FileOperation } from "./components/FileOperationsModal";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { QuickSettings, type QuickSettingsState } from "./components/QuickSettings";
import * as path from "path";
import { getGitStatus, formatGitBranch, formatGitStatus, invalidateGitCache } from "./lib/GitIntegration";
import type { GitStatus } from "./lib/GitIntegration";
import { DARK_THEME, THEMES } from "./lib/ThemeSystem";
import type { Theme } from "./lib/ThemeSystem";
import { getLayoutConfig, getScreenSizeLabel } from "./lib/ResponsiveLayout";
import type { LayoutConfig, ScreenSize } from "./lib/ResponsiveLayout";
import { loadSession, saveSession, addRecentFile } from "./lib/SessionManager";
import { detectFileInfo, formatEncoding, formatLineEnding, formatIndent, type FileInfo } from "./lib/FileEncoding";

type Panel = "tree" | "viewer" | "terminal" | "source" | "graph" | "agent";

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
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>(DARK_THEME);
  const [quickSettings, setQuickSettings] = useState<QuickSettingsState>({
    wordWrap: false,
    indentGuides: true,
    minimap: true,
    lineNumbers: true,
    fontSize: "normal",
    tabSize: 2,
    autoSave: false,
    theme: DARK_THEME,
  });
  const dimensions = useTerminalDimensions();
  const [treeWidth, setTreeWidth] = useState(30);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [fileStats, setFileStats] = useState<{ size: number; lineCount: number } | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [antFrame, setAntFrame] = useState(0);
  const [antStatus, setAntStatus] = useState<"walking" | "dying" | "dead">("walking");
  const [deathProgress, setDeathProgress] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showAgent, setShowAgent] = useState(false);

  // Split view state
  const [splitMode, setSplitMode] = useState<"none" | "vertical" | "horizontal">("none");

  // Cursor position tracking
  const [cursorPos, setCursorPos] = useState<{ line: number; column: number }>({ line: 1, column: 1 });
  const [splitFile, setSplitFile] = useState<string | null>(null);
  const [activeSplit, setActiveSplit] = useState<"left" | "right">("left");
  const { notifications, notify, dismiss, success, error } = useNotifications();

  // File operations state
  const [showFileOps, setShowFileOps] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [fileOpsOperation, setFileOpsOperation] = useState<FileOperation>("create-file");
  const [fileOpsTarget, setFileOpsTarget] = useState("");
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);

  const isAnyModalOpen = showFuzzyFinder || showCommandPalette || showGlobalSearch || showHelpPanel || showShortcuts || showThemePicker || showFileOps || showQuickSettings;

  // Responsive layout configuration
  const layoutConfig = getLayoutConfig(dimensions.width || 80, dimensions.height || 24);
  const isMiniMode = layoutConfig.isMiniMode;
  const isCompactMode = layoutConfig.screenSize === "compact";

  // Load session on mount
  useEffect(() => {
    const session = loadSession(rootPath);
    if (session.openTabs.length > 0) {
      setOpenTabs(session.openTabs.map(f => ({ filePath: f })));
      if (session.activeTab) {
        const activeIndex = session.openTabs.indexOf(session.activeTab);
        if (activeIndex >= 0) setActiveTabIndex(activeIndex);
      }
    }
    if (session.focusedPanel) {
      setFocusedPanel(session.focusedPanel as Panel);
    }
    if (session.treeWidth) {
      setTreeWidth(session.treeWidth);
    }
    if (session.showAgent !== undefined) {
      setShowAgent(session.showAgent);
    }
    if (session.recentFiles) {
      setRecentFiles(session.recentFiles);
    }
  }, [rootPath]);

  // Save session when state changes (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveSession(rootPath, {
        openTabs: openTabs.map(t => t.filePath),
        activeTab: openTabs[activeTabIndex]?.filePath || null,
        focusedPanel,
        treeWidth,
        showAgent,
        recentFiles,
      });
    }, 1000); // Debounce 1 second

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [rootPath, openTabs, activeTabIndex, focusedPanel, treeWidth, showAgent, recentFiles]);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Animate the ant
  useEffect(() => {
    const antTimer = setInterval(() => {
      if (antStatus === "walking") {
        setAntFrame((f) => (f + 1) % 40);
      } else if (antStatus === "dying") {
        setDeathProgress((p) => {
          if (p >= 5) {
            setAntStatus("dead");
            return p;
          }
          return p + 1;
        });
      }
    }, antStatus === "dying" ? 150 : 300);
    return () => clearInterval(antTimer);
  }, [antStatus]);

  // Generate animated 3-line ant walking or dying
  const getAntLines = (maxWidth: number) => {
    if (antStatus === "dead") return ["", "", ""];

    const antWidth = 12;
    const walkSpace = Math.max(0, maxWidth - antWidth);
    if (walkSpace <= 0) return ["", "", ""];

    const pos = antFrame % (walkSpace + 1);
    const spaces = " ".repeat(pos);

    if (antStatus === "dying") {
      const deathFrames = [
        [
          "      * *",
          "  o O ( x.x )",
          "    * * * *"
        ],
        [
          "       . .",
          "    . ( x-x ) .",
          "       . ."
        ],
        [
          "        *",
          "      . * .",
          "        *"
        ],
        [
          "         .",
          "       . .",
          "         ."
        ],
        [
          "",
          "        .",
          ""
        ],
        ["", "", ""]
      ];
      const frame = deathFrames[deathProgress] || deathFrames[deathFrames.length - 1];
      return frame!.map(line => `${spaces}${line}`);
    }

    const frames = [
      [
        "      \\ \\",
        " ooO( o.o )>",
        "  / / / /"
      ],
      [
        "      / /",
        " ooO( o.o )>",
        "  \\ \\ \\ \\"
      ]
    ];

    const frame = frames[antFrame % 2] || frames[0];
    return frame!.map(line => `${spaces}${line}`);
  };

  // Get currently selected file from active tab
  const selectedFile = openTabs[activeTabIndex]?.filePath || null;

  // Update file stats and encoding when file changes
  useEffect(() => {
    if (!selectedFile) {
      setFileStats(null);
      setFileInfo(null);
      return;
    }

    const updateStats = async () => {
      try {
        const file = Bun.file(selectedFile);
        const size = file.size;
        const content = await file.text();
        const lineCount = content.split("\n").length;
        setFileStats({ size, lineCount });

        // Detect file encoding info
        const info = detectFileInfo(selectedFile);
        setFileInfo(info);
      } catch {
        setFileStats(null);
        setFileInfo(null);
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
      shortcut: "Ctrl+P",
      description: "Quick open a file",
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
      shortcut: "Tab",
      category: "Navigation",
      action: () => setFocusedPanel("tree"),
    },
    {
      id: "focus-editor",
      label: "Focus Editor",
      shortcut: "Tab",
      category: "Navigation",
      action: () => setFocusedPanel("viewer"),
    },
    {
      id: "focus-terminal",
      label: "Focus Terminal",
      shortcut: "Tab",
      category: "Navigation",
      action: () => setFocusedPanel("terminal"),
    },
    {
      id: "focus-agent",
      label: "Focus AI Agent",
      shortcut: "Tab",
      category: "Navigation",
      action: () => {
        setShowAgent(true);
        setFocusedPanel("agent");
      },
    },
    {
      id: "focus-source-control",
      label: "Focus Source Control",
      shortcut: "Tab",
      category: "Navigation",
      action: () => setFocusedPanel("source"),
    },
    {
      id: "focus-git-graph",
      label: "Focus Git Graph",
      shortcut: "Tab",
      category: "Navigation",
      action: () => setFocusedPanel("graph"),
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
    // File Operations
    {
      id: "new-file",
      label: "New File",
      description: "Create a new file in current folder",
      shortcut: "n",
      category: "Files",
      action: () => {
        const targetDir = selectedFile ? path.dirname(selectedFile) : rootPath;
        setFileOpsOperation("create-file");
        setFileOpsTarget(targetDir);
        setShowFileOps(true);
      },
    },
    {
      id: "new-folder",
      label: "New Folder",
      description: "Create a new folder",
      shortcut: "N",
      category: "Files",
      action: () => {
        const targetDir = selectedFile ? path.dirname(selectedFile) : rootPath;
        setFileOpsOperation("create-folder");
        setFileOpsTarget(targetDir);
        setShowFileOps(true);
      },
    },
    {
      id: "rename-file",
      label: "Rename File/Folder",
      description: "Rename current file or folder",
      shortcut: "r",
      category: "Files",
      action: () => {
        if (selectedFile) {
          setFileOpsOperation("rename");
          setFileOpsTarget(selectedFile);
          setShowFileOps(true);
        }
      },
    },
    {
      id: "delete-file",
      label: "Delete File/Folder",
      description: "Delete current file or folder",
      shortcut: "d",
      category: "Files",
      action: () => {
        if (selectedFile) {
          setFileOpsOperation("delete");
          setFileOpsTarget(selectedFile);
          setShowFileOps(true);
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
      id: "toggle-agent",
      label: "Toggle AI Agent",
      description: "Show/Hide Agent Panel",
      shortcut: "Ctrl+Space",
      category: "View",
      action: () => {
        setShowAgent(v => {
          const newState = !v;
          if (newState) setFocusedPanel("agent");
          else setFocusedPanel("terminal");
          return newState;
        });
      }
    },
    {
      id: "change-theme",
      label: "Change Color Theme",
      description: "Switch between color themes",
      category: "View",
      action: () => setShowThemePicker(true),
    },
    // View Toggle Commands
    {
      id: "toggle-split-view",
      label: "Toggle Split View",
      description: "Split editor into two panes",
      shortcut: "Ctrl+\\",
      category: "View",
      action: () => {
        if (splitMode === "none" && selectedFile) {
          setSplitMode("vertical");
          setSplitFile(selectedFile);
        } else {
          setSplitMode("none");
          setSplitFile(null);
        }
      },
    },
    {
      id: "quick-settings",
      label: "Quick Settings",
      description: "Open quick settings panel",
      shortcut: "Ctrl+,",
      category: "View",
      action: () => setShowQuickSettings(true),
    },
    {
      id: "keyboard-shortcuts",
      label: "All Keyboard Shortcuts",
      description: "Show keyboard shortcuts overlay",
      shortcut: "Ctrl+Shift+/",
      category: "View",
      action: () => setShowShortcuts(true),
    },
    {
      id: "toggle-maximize",
      label: "Toggle Focus Mode",
      description: "Maximize current panel",
      shortcut: "Ctrl+F",
      category: "View",
      action: () => setIsMaximized(v => !v),
    },
    // Application
    {
      id: "show-help",
      label: "Show Help Panel",
      shortcut: "Ctrl+B / ?",
      category: "Application",
      action: () => setShowHelpPanel(true),
    },
    {
      id: "clear-session",
      label: "Clear Session",
      description: "Close all tabs and reset state",
      category: "Application",
      action: () => {
        setOpenTabs([]);
        setActiveTabIndex(0);
        setShowAgent(false);
        setFocusedPanel("tree");
      },
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
    if (showFuzzyFinder || showCommandPalette || showGlobalSearch || showThemePicker || showQuickSettings) return;

    // Help - Simple universal shortcuts (Ctrl+B, ?, or F1)
    if (
      event.name === "f1" ||
      (event.name === "?" && !event.ctrl && !event.meta) ||
      (event.ctrl && (event.name === "b" || event.name === "B")) ||
      (event.meta && (event.name === "h" || event.name === "H"))
    ) {
      setShowHelpPanel((v) => !v);
      return;
    }

    // Don't handle other keys if help is open
    if (showHelpPanel || showShortcuts) return;

    // Ctrl+Shift+/ - Keyboard shortcuts overlay
    if (event.ctrl && event.shift && event.name === "/") {
      setShowShortcuts(true);
      return;
    }

    // Ctrl+, - Quick settings
    if (event.ctrl && event.name === ",") {
      setShowQuickSettings(true);
      return;
    }

    // Ctrl+\ or Ctrl+Shift+Z - Zen Mode (distraction-free)
    if ((event.ctrl && event.name === "\\") ||
        (event.ctrl && event.shift && (event.name === "z" || event.name === "Z"))) {
      setZenMode(z => !z);
      return;
    }

    // Ctrl+Shift+F - Global search
    if (event.ctrl && event.shift && (event.name === "f" || event.name === "F")) {
      setShowGlobalSearch(true);
      return;
    }

    // Command Palette - Simple universal shortcuts (Ctrl+K or Cmd+Shift+P)
    if (
      (event.ctrl && (event.name === "k" || event.name === "K")) ||
      (event.meta && event.shift && (event.name === "p" || event.name === "P"))
    ) {
      setShowCommandPalette(true);
      return;
    }

    // Ctrl+P - Open fuzzy finder
    if (event.ctrl && !event.shift && (event.name === "p" || event.name === "P")) {
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

    // Ctrl+Tab - Next tab (when in viewer)
    if (event.ctrl && event.name === "tab" && !event.shift && focusedPanel === "viewer") {
      if (openTabs.length > 1) {
        setActiveTabIndex((i) => (i + 1) % openTabs.length);
      }
      return;
    }

    // Copy content: Ctrl+Y (Yank) or Cmd+C (standard Mac)
    if ((event.ctrl && (event.name === "y" || event.name === "Y")) || (event.meta && event.name === "c")) {
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

    // Ctrl+G - Toggle mascot
    if (event.ctrl && (event.name === "g" || event.name === "G")) {
      if (antStatus === "walking") {
        setAntStatus("dying");
        setDeathProgress(0);
        success("Mascot: Off", 1500);
      } else {
        setAntStatus("walking");
        success("Mascot: On", 1500);
      }
      return;
    }

    // Global keybindings
    if (event.ctrl && event.name === "q") {
      process.exit(0);
    }

    // Ctrl+F - Toggle Center Focus / Maximize
    if (event.ctrl && !event.shift && (event.name === "f" || event.name === "F")) {
      setIsMaximized((m) => !m);
      success(isMaximized ? "Focus: Off" : "Focus: On", 1000);
      return;
    }

    // Ctrl+Space - Toggle Agent
    // Depending on the terminal, this might come as name="space" + ctrl, or name=" " + ctrl
    if (event.ctrl && (event.name === "space" || event.name === " ")) {
      setShowAgent(v => {
        const newState = !v;
        if (newState) setFocusedPanel("agent");
        else setFocusedPanel("terminal");
        return newState;
      });
      return;
    }

    // Panel navigation with Tab
    // Include "agent" instead of "terminal" when agent panel is visible
    if (event.name === "tab" && !event.shift) {
      setFocusedPanel((current) => {
        const order: Panel[] = showAgent
          ? ["tree", "source", "graph", "viewer", "agent"]
          : ["tree", "source", "graph", "viewer", "terminal"];
        const currentIndex = order.indexOf(current);
        // Handle case where current panel is not in the order (e.g., terminal when agent is shown)
        if (currentIndex === -1) return order[0] as Panel;
        return order[(currentIndex + 1) % order.length] as Panel;
      });
    } else if (event.name === "tab" && event.shift) {
      setFocusedPanel((current) => {
        const order: Panel[] = showAgent
          ? ["tree", "source", "graph", "viewer", "agent"]
          : ["tree", "source", "graph", "viewer", "terminal"];
        const currentIndex = order.indexOf(current);
        // Handle case where current panel is not in the order
        if (currentIndex === -1) return order[order.length - 1] as Panel;
        return order[(currentIndex - 1 + order.length) % order.length] as Panel;
      });
    }

    // Split view: Ctrl+\ to toggle vertical split
    if (event.ctrl && event.name === "\\") {
      if (splitMode === "vertical") {
        // Close split
        setSplitMode("none");
        setSplitFile(null);
        success("Split: Closed", 1000);
      } else if (selectedFile && openTabs.length > 1) {
        // Open vertical split with another open file
        setSplitMode("vertical");
        // Find a different file to show in the split
        const otherTab = openTabs.find((t) => t.filePath !== selectedFile);
        if (otherTab) {
          setSplitFile(otherTab.filePath);
          success("Split: Vertical", 1000);
        }
      } else if (selectedFile) {
        // Just split with the same file
        setSplitMode("vertical");
        setSplitFile(selectedFile);
        success("Split: Vertical (same file)", 1000);
      }
      return;
    }

    // Alt+Left/Right to switch between splits
    if (splitMode !== "none" && event.alt) {
      if (event.name === "left" || event.name === "h") {
        setActiveSplit("left");
        return;
      }
      if (event.name === "right" || event.name === "l") {
        setActiveSplit("right");
        return;
      }
    }

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

  // Handle file operations from FileTree
  const handleFileOperation = (operation: FileOperation, targetPath: string) => {
    setFileOpsOperation(operation);
    setFileOpsTarget(targetPath);
    setShowFileOps(true);
  };

  // Refresh file tree after successful operation
  const handleFileOpsSuccess = (newPath?: string) => {
    setShowFileOps(false);
    setTreeRefreshKey(k => k + 1); // Force FileTree refresh
    invalidateGitCache(); // Refresh git status

    // Show success notification
    const opName = {
      "create-file": "File created",
      "create-folder": "Folder created",
      "rename": "Renamed",
      "delete": "Deleted"
    }[fileOpsOperation];
    success(opName, 2000);

    // Open newly created file
    if (newPath && fileOpsOperation === "create-file") {
      handleFileSelect(newPath);
    }
  };

  const mainWidth = (dimensions.width || 80) - treeWidth - 4;
  const totalHeight = (dimensions.height || 40) - 6; // -6 for header(5) and status bar(1)
  const tabsVisible = openTabs.length > 0;
  const availableContentHeight = totalHeight - (tabsVisible ? 1 : 0);

  // Focus mode calculations
  const isSidebarFocused = focusedPanel === "tree" || focusedPanel === "source" || focusedPanel === "graph";
  const responsiveTreeWidth = isCompactMode ? layoutConfig.sidebarWidth : treeWidth;
  const currentTreeWidth = isMaximized && isSidebarFocused ? dimensions.width || 80 : (isMaximized ? 0 : responsiveTreeWidth);
  const responsiveHeaderHeight = isCompactMode ? 2 : 5;
  const responsiveTotalHeight = (dimensions.height || 40) - responsiveHeaderHeight - 1; // -header -status bar
  const responsiveViewerRatio = isCompactMode ? 0.4 : 0.35;
  const currentViewerHeight = isMaximized ? (focusedPanel === "viewer" ? responsiveTotalHeight : 0) : Math.floor(responsiveTotalHeight * responsiveViewerRatio);
  const currentTerminalHeight = isMaximized ? (focusedPanel === "terminal" ? responsiveTotalHeight : 0) : (responsiveTotalHeight - currentViewerHeight - (tabsVisible ? 1 : 0));

  // Mini mode render
  if (isMiniMode) {
    return (
      <>
        <MiniMode
          rootPath={rootPath}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          showAgent={showAgent}
          onToggleAgent={() => setShowAgent(v => !v)}
        />
        {/* Overlays still work in mini mode */}
        {showFuzzyFinder && (
          <FuzzyFinder
            rootPath={rootPath}
            isOpen={showFuzzyFinder}
            onClose={() => setShowFuzzyFinder(false)}
            onSelect={handleFileSelect}
            recentFiles={recentFiles}
          />
        )}
        {showHelpPanel && (
          <HelpPanel
            isOpen={showHelpPanel}
            onClose={() => setShowHelpPanel(false)}
          />
        )}
        <Notifications notifications={notifications} onDismiss={dismiss} />
      </>
    );
  }

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%", bg: "#050505" }}>
      {/* Top Header - Compact or Full (hidden in Zen Mode) */}
      {!zenMode && (isCompactMode ? (
        <CompactHeader rootPath={rootPath} width={dimensions.width || 80} />
      ) : (
      <box style={{ height: 5, borderBottom: true, borderColor: "cyan", flexDirection: "column", bg: "#0b0b0b" }}>
        {(() => {
          const logoWidth = 30;
          const terminalWidth = dimensions.width || 80;

          // Calculate available space for each row to prevent pushing content
          // Row 1: Logo(30) + Path(Variable)
          const pathText = rootPath.replace(process.env.HOME || "", "~");
          const pathWidth = pathText.length;
          const row1Space = terminalWidth - logoWidth - pathWidth - 4;

          // Row 2: Mascot walks + Help part 1 (approx 43-45 chars)
          const row2Space = terminalWidth - logoWidth - 45 - 4;

          // Row 3: Mascot walks + Help part 2 (approx 46 chars)
          const row3Space = terminalWidth - logoWidth - 46 - 4;

          // The ant walks in the shared space, so we use the minimum available
          const maxAntSpace = Math.max(5, Math.min(row1Space, row2Space, row3Space));
          const antLines = getAntLines(maxAntSpace);

          return (
            <>
              {/* Row 1 */}
              <box style={{ paddingX: 1, flexDirection: "row", bg: "#1a1a1a" }}>
                <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a", width: logoWidth }}>  ▀█▀ █▀▀ █▀▄ █▄▀▄█ █ █▀▄ █▀▀</text>
                <box style={{ flexGrow: 1, bg: "#1a1a1a" }}>
                  <text style={{ fg: "cyan" }}>{antLines[0]}</text>
                </box>
                <text style={{ fg: "gray", bg: "#1a1a1a" }}>{pathText}</text>
              </box>

              {/* Row 2 */}
              <box style={{ paddingX: 1, flexDirection: "row", bg: "#1a1a1a" }}>
                <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a", width: logoWidth }}>   █  █▀▀ █▀▄ █ █ █ █ █ █ █▀▀</text>
                <box style={{ flexGrow: 1, bg: "#1a1a1a" }}>
                  <text style={{ fg: "cyan" }}>{antLines[1]}</text>
                </box>
                <text style={{ fg: "#d4a800", bg: "#1a1a1a" }}>Ctrl+P: open | Ctrl+K: menu | Ctrl+F: focus</text>
              </box>

              {/* Row 3 */}
              <box style={{ paddingX: 1, flexDirection: "row", bg: "#1a1a1a" }}>
                <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a", width: logoWidth }}>   ▀  ▀▀▀ ▀ ▀ ▀   ▀ ▀ ▀▀  ▀▀▀</text>
                <box style={{ flexGrow: 1, bg: "#1a1a1a" }}>
                  <text style={{ fg: "cyan" }}>{antLines[2]}</text>
                </box>
                <text style={{ fg: "#d4a800", bg: "#1a1a1a" }}>Ctrl+Space: agent | Ctrl+B: help | Ctrl+G: ant</text>
              </box>
            </>
          );
        })()}
      </box>
      ))}

      {/* Main content */}
      <box style={{ flexGrow: 1, flexDirection: "row" }}>
        {/* Sidebar - Left panel (hidden in Zen Mode) */}
        {currentTreeWidth > 0 && !zenMode && (
          <box
            style={{ width: currentTreeWidth, flexDirection: "column", height: "100%" }}
            onMouseDown={(event: any) => {
              // Calculate which panel was clicked based on y coordinate
              // Header is 5 lines, sidebar panels use flexGrow 4:3:3 ratio
              const sidebarHeight = totalHeight;
              const headerOffset = 5;
              const relativeY = event.y - headerOffset;

              // FlexGrow ratios: tree=4, source=3, graph=3 (total=10)
              const treeHeight = Math.floor(sidebarHeight * 0.4);
              const sourceHeight = Math.floor(sidebarHeight * 0.3);

              if (relativeY < treeHeight) {
                setFocusedPanel("tree");
              } else if (relativeY < treeHeight + sourceHeight) {
                setFocusedPanel("source");
              } else {
                setFocusedPanel("graph");
              }
            }}
          >
            {/* FileTree - Always visible, takes full height in compact mode */}
            <box style={{ flexGrow: isCompactMode ? 1 : 4 }}>
              <FileTree
                key={treeRefreshKey}
                rootPath={rootPath}
                onFileSelect={handleFileSelect}
                focused={!isAnyModalOpen && focusedPanel === "tree"}
                onFocus={() => setFocusedPanel("tree")}
                onFileOperation={handleFileOperation}
              />
            </box>
            {/* Source Control - Hidden in compact mode */}
            {!isCompactMode && layoutConfig.panelsVisible.sourceControl && (
              <box style={{ flexGrow: 3 }}>
                <SourceControl
                  rootPath={rootPath}
                  focused={!isAnyModalOpen && focusedPanel === "source"}
                  onFocus={() => setFocusedPanel("source")}
                />
              </box>
            )}
            {/* Git Graph - Hidden in compact mode */}
            {!isCompactMode && layoutConfig.panelsVisible.gitGraph && (
              <box style={{ flexGrow: 3 }}>
                <GitGraph
                  rootPath={rootPath}
                  focused={!isAnyModalOpen && focusedPanel === "graph"}
                  onFocus={() => setFocusedPanel("graph")}
                />
              </box>
            )}
          </box>
        )}

        {/* Right side - Tabs + Viewer + Terminal */}
        {(!isMaximized || !isSidebarFocused) && (
          <box style={{ flexDirection: "column", flexGrow: 1 }}>
            {/* Tab Bar (hidden in Zen Mode) */}
            {openTabs.length > 0 && !zenMode && (
              <TabBar
                tabs={openTabs}
                activeTabIndex={activeTabIndex}
                onSelectTab={setActiveTabIndex}
                onCloseTab={handleCloseTab}
                focused={!isAnyModalOpen && focusedPanel === "viewer"}
              />
            )}

            {/* File Viewer / Welcome Screen - Top right (35% or 100% if focused) */}
            {currentViewerHeight > 0 && (
              <box style={{ height: currentViewerHeight }} onMouseDown={() => setFocusedPanel("viewer")}>
                {openTabs.length === 0 ? (
                  <WelcomeScreen
                    height={currentViewerHeight}
                    onOpenFile={() => setShowFuzzyFinder(true)}
                    onOpenTerminal={() => setFocusedPanel("terminal")}
                    onShowHelp={() => setShowHelpPanel(true)}
                    onShowCommandPalette={() => setShowCommandPalette(true)}
                    recentFiles={recentFiles}
                    onOpenRecentFile={handleFileSelect}
                    rootPath={rootPath}
                    isCompact={isCompactMode}
                  />
                ) : splitMode === "vertical" && splitFile ? (
                  <box style={{ flexDirection: "row", height: "100%" }}>
                    {/* Left split */}
                    <box
                      style={{ width: "50%", height: "100%" }}
                      onMouseDown={() => setActiveSplit("left")}
                    >
                      <FileViewer
                        filePath={selectedFile}
                        focused={!isAnyModalOpen && focusedPanel === "viewer" && activeSplit === "left"}
                        rootPath={rootPath}
                        height={currentViewerHeight}
                        onCursorChange={activeSplit === "left" ? (line, column) => setCursorPos({ line, column }) : undefined}
                        onJumpToFile={(targetPath, line) => {
                          handleFileSelect(targetPath);
                        }}
                      />
                    </box>
                    {/* Right split */}
                    <box
                      style={{ width: "50%", height: "100%" }}
                      onMouseDown={() => setActiveSplit("right")}
                    >
                      <FileViewer
                        filePath={splitFile}
                        focused={!isAnyModalOpen && focusedPanel === "viewer" && activeSplit === "right"}
                        rootPath={rootPath}
                        height={currentViewerHeight}
                        onCursorChange={activeSplit === "right" ? (line, column) => setCursorPos({ line, column }) : undefined}
                        onJumpToFile={(targetPath, line) => {
                          setSplitFile(targetPath);
                        }}
                      />
                    </box>
                  </box>
                ) : (
                  <FileViewer
                    filePath={selectedFile}
                    focused={!isAnyModalOpen && focusedPanel === "viewer"}
                    rootPath={rootPath}
                    height={currentViewerHeight}
                    onCursorChange={(line, column) => setCursorPos({ line, column })}
                    onJumpToFile={(targetPath, line) => {
                      // Open the file and optionally jump to line
                      handleFileSelect(targetPath);
                      // TODO: Pass line number to FileViewer for initial scroll
                    }}
                  />
                )}
              </box>
            )}

            {/* Terminal - Bottom (occupies remaining space, hidden in Zen Mode) */}
            {currentTerminalHeight > 0 && !zenMode && (
              <box style={{ height: currentTerminalHeight }}>
                {showAgent ? (
                  <AgentPanel
                    rootPath={rootPath}
                    focused={!isAnyModalOpen && focusedPanel === "agent"}
                    onFocus={() => setFocusedPanel("agent")}
                  />
                ) : (
                  <box onMouseDown={() => setFocusedPanel("terminal")} style={{ height: "100%" }}>
                    <Terminal
                      cwd={rootPath}
                      focused={!isAnyModalOpen && focusedPanel === "terminal"}
                      onFocusRequest={() => setFocusedPanel("terminal")}
                      onPasteReady={(pasteFn) => { terminalPasteRef.current = pasteFn; }}
                      onCopyReady={(copyFn) => { terminalCopyRef.current = copyFn; }}
                      height={currentTerminalHeight}
                    />
                  </box>
                )}
              </box>
            )}
          </box>
        )}
      </box>

      {/* Status bar (hidden in Zen Mode) */}
      {!zenMode && <box style={{ height: 1, paddingX: 1, bg: "black", flexDirection: "row" }}>
        <box style={{ flexDirection: "row", flexShrink: 1 }}>
          {/* Git branch */}
          {gitStatus?.isRepo && (
            <box style={{ flexDirection: "row", flexShrink: 0 }}>
              <text style={{ fg: "#d4a800" }}>{formatGitBranch(gitStatus)}</text>
              <text style={{ fg: gitStatus.clean ? "green" : "yellow" as any }}>
                {" "}{formatGitStatus(gitStatus)}
              </text>
              <text style={{ fg: "gray" }}> │ </text>
            </box>
          )}
          {/* File path - with truncation */}
          <box style={{ flexShrink: 1 }}>
            <text style={{ fg: "#d4a800" }}>
              {selectedFile ? path.relative(rootPath, selectedFile) : "No file"}
            </text>
          </box>
          {/* File stats */}
          {fileStats && (
            <box style={{ flexDirection: "row", flexShrink: 0 }}>
              <text style={{ fg: "gray" }}> │ </text>
              <text style={{ fg: "gray", dim: true }}>
                {fileStats.lineCount} lines, {formatFileSize(fileStats.size)}
              </text>
            </box>
          )}
          {/* File encoding info */}
          {fileInfo && !isCompactMode && (
            <box style={{ flexDirection: "row", flexShrink: 0 }}>
              <text style={{ fg: "gray" }}> │ </text>
              <text style={{ fg: "gray", dim: true }}>
                {formatEncoding(fileInfo)}
              </text>
              <text style={{ fg: "gray" }}> </text>
              <text style={{ fg: "gray", dim: true }}>
                {formatLineEnding(fileInfo.lineEnding)}
              </text>
              {formatIndent(fileInfo) && (
                <>
                  <text style={{ fg: "gray" }}> </text>
                  <text style={{ fg: "gray", dim: true }}>
                    {formatIndent(fileInfo)}
                  </text>
                </>
              )}
            </box>
          )}
        </box>

        {/* Spacer to push content to the right */}
        <box style={{ flexGrow: 1 }} />

        <box style={{ flexDirection: "row", gap: 2, flexShrink: 0 }}>
          {/* Cursor position */}
          {selectedFile && !isCompactMode && (
            <text style={{ fg: "gray" }}>
              Ln {cursorPos.line}, Col {cursorPos.column}
            </text>
          )}
          {/* Split view indicator */}
          {splitMode !== "none" && (
            <text style={{ fg: "cyan" }}>
              SPLIT {activeSplit.toUpperCase()}
            </text>
          )}
          {/* Screen size indicator */}
          <text style={{ fg: isCompactMode ? "yellow" : "gray", dim: !isCompactMode }}>
            {getScreenSizeLabel(layoutConfig.screenSize)}
          </text>
          {/* Clock - hidden in compact */}
          {!isCompactMode && (
            <text style={{ fg: "gray", dim: true }}>
              {currentTime.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
            </text>
          )}
          {/* Panel indicator */}
          <box style={{ flexDirection: "row" }}>
            <text style={{ fg: "gray" }}>[</text>
            <text style={{ fg: "cyan", bold: true }}>
              {(() => {
                switch (focusedPanel) {
                  case "tree": return isCompactMode ? "EXP" : "EXPLORER";
                  case "viewer": return isCompactMode ? "VIEW" : "VIEWER";
                  case "terminal": return isCompactMode ? "TERM" : "TERMINAL";
                  case "source": return isCompactMode ? "SRC" : "SOURCE";
                  case "graph": return isCompactMode ? "GIT" : "GRAPH";
                  case "agent": return isCompactMode ? "AI" : "AGENT";
                  default: return (focusedPanel as string).toUpperCase();
                }
              })()}
            </text>
            <text style={{ fg: "gray" }}>]</text>
          </box>
        </box>
      </box>}

      {/* Zen Mode indicator */}
      {zenMode && (
        <box style={{ position: "absolute", top: 0, right: 2, height: 1 }}>
          <text style={{ fg: "cyan", dim: true }}>ZEN (Ctrl+\ to exit)</text>
        </box>
      )}

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
          currentTheme={theme}
          onSelect={(t) => {
            setTheme(t);
            success(`Theme: ${t.name}`, 2000);
          }}
        />
      )}

      {showHelpPanel && (
        <HelpPanel
          isOpen={showHelpPanel}
          onClose={() => setShowHelpPanel(false)}
        />
      )}

      {showFileOps && (
        <FileOperationsModal
          isOpen={showFileOps}
          operation={fileOpsOperation}
          targetPath={fileOpsTarget}
          onClose={() => setShowFileOps(false)}
          onSuccess={handleFileOpsSuccess}
          onError={(msg) => { error(msg, 3000); setShowFileOps(false); }}
        />
      )}

      {showQuickSettings && (
        <QuickSettings
          isOpen={showQuickSettings}
          onClose={() => setShowQuickSettings(false)}
          settings={quickSettings}
          onSettingsChange={(changes) => {
            setQuickSettings(prev => ({ ...prev, ...changes }));
            if (changes.theme) {
              setTheme(changes.theme);
            }
          }}
        />
      )}

      {showShortcuts && (
        <KeyboardShortcuts
          isOpen={showShortcuts}
          onClose={() => setShowShortcuts(false)}
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
