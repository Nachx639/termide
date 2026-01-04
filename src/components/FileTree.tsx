import React, { useState, useEffect, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";
import { getFileGitStatus, type FileGitStatus, getFileStatusColor, getFileStatusIcon } from "../lib/GitIntegration";
import { getFileIconSimple } from "../lib/FileIcons";

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  expanded?: boolean;
  level: number;
  gitStatus?: FileGitStatus | null;
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (filePath: string) => void;
  focused: boolean;
  onFocus?: () => void;
  onFileOperation?: (operation: "create-file" | "create-folder" | "rename" | "delete", targetPath: string) => void;
}

function buildTree(dirPath: string, level: number = 0): FileNode[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
        expanded: false,
        level,
        children: entry.isDirectory() ? [] : undefined,
      }));
  } catch {
    return [];
  }
}

function flattenTree(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.isDirectory && node.expanded && node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

export function FileTree({ rootPath, onFileSelect, focused, onFocus, onFileOperation }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [gitStatuses, setGitStatuses] = useState<Map<string, FileGitStatus>>(new Map());

  // Fetch git statuses for visible files
  const updateGitStatuses = useCallback(async (nodes: FileNode[]) => {
    const newStatuses = new Map<string, FileGitStatus>();
    const flat = flattenTree(nodes);

    for (const node of flat) {
      if (!node.isDirectory) {
        const status = await getFileGitStatus(node.path, rootPath);
        if (status) {
          newStatuses.set(node.path, status);
        }
      }
    }

    setGitStatuses(newStatuses);
  }, [rootPath]);

  useEffect(() => {
    const initialTree = buildTree(rootPath);
    setTree(initialTree);
    updateGitStatuses(initialTree);
  }, [rootPath, updateGitStatuses]);

  // Refresh git statuses periodically
  useEffect(() => {
    const interval = setInterval(() => {
      updateGitStatuses(tree);
    }, 5000);
    return () => clearInterval(interval);
  }, [tree, updateGitStatuses]);

  const flatList = flattenTree(tree);

  useKeyboard((event) => {
    if (!focused) return;

    if (event.name === "up" || event.name === "k") {
      setSelectedIndex((i) => {
        const next = Math.max(0, i - 1);
        if (next < scrollTop) setScrollTop(next);
        return next;
      });
    } else if (event.name === "down" || event.name === "j") {
      setSelectedIndex((i) => {
        const next = Math.min(flatList.length - 1, i + 1);
        const visibleHeight = 15; // Approximate visible height
        if (next >= scrollTop + visibleHeight) setScrollTop(next - visibleHeight + 1);
        return next;
      });
    } else if (event.name === "return" || event.name === "l") {
      const selected = flatList[selectedIndex];
      if (selected) {
        if (selected.isDirectory) {
          const toggleExpand = (nodes: FileNode[]): FileNode[] => {
            return nodes.map((node) => {
              if (node.path === selected.path) {
                const expanded = !node.expanded;
                return {
                  ...node,
                  expanded,
                  children: expanded ? buildTree(node.path, node.level + 1) : [],
                };
              }
              if (node.children) {
                return { ...node, children: toggleExpand(node.children) };
              }
              return node;
            });
          };
          setTree(toggleExpand(tree));
        } else {
          onFileSelect(selected.path);
        }
      }
    } else if (event.name === "h") {
      const selected = flatList[selectedIndex];
      if (selected?.isDirectory && selected.expanded) {
        const collapse = (nodes: FileNode[]): FileNode[] => {
          return nodes.map((node) => {
            if (node.path === selected.path) {
              return { ...node, expanded: false, children: [] };
            }
            if (node.children) {
              return { ...node, children: collapse(node.children) };
            }
            return node;
          });
        };
        setTree(collapse(tree));
      }
    }

    // File operations (only if onFileOperation is provided)
    if (onFileOperation) {
      const selected = flatList[selectedIndex];
      const targetDir = selected?.isDirectory ? selected.path : (selected ? path.dirname(selected.path) : rootPath);

      // n = new file
      if (event.name === "n" && !event.shift) {
        onFileOperation("create-file", targetDir);
        return;
      }

      // N (shift+n) = new folder
      if (event.name === "N" || (event.name === "n" && event.shift)) {
        onFileOperation("create-folder", targetDir);
        return;
      }

      // r = rename
      if (event.name === "r" && selected) {
        onFileOperation("rename", selected.path);
        return;
      }

      // d or Delete = delete
      if ((event.name === "d" || event.name === "delete") && selected) {
        onFileOperation("delete", selected.path);
        return;
      }
    }
  });

  const borderColor = focused ? "cyan" : "gray";

  return (
    <box style={{ flexDirection: "column", border: true, borderColor, height: "100%", bg: "#0b0b0b" }} onMouseDown={onFocus}>
      <box style={{ paddingX: 1, height: 1, bg: "#1a1a1a", flexDirection: "row" }}>
        {focused && <text style={{ fg: "black", bg: "cyan", bold: true }}> FOCUS </text>}
        <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a" }}>Explorer</text>
      </box>
      <box
        style={{ flexDirection: "row", flexGrow: 1, bg: "#0b0b0b", position: "relative" }}
        onMouse={(event: any) => {
          if (!focused) return;
          if (event.action === "wheel") {
            if (event.direction === "up") {
              setSelectedIndex(i => Math.max(0, i - 1));
              if (selectedIndex - 1 < scrollTop) setScrollTop(Math.max(0, scrollTop - 1));
            } else {
              setSelectedIndex(i => Math.min(flatList.length - 1, i + 1));
              const visibleHeight = 20;
              if (selectedIndex + 1 >= scrollTop + visibleHeight) setScrollTop(scrollTop + 1);
            }
          }
        }}
      >
        <scrollbox style={{ flexDirection: "column", paddingX: 1, flexGrow: 1, bg: "#0b0b0b" }}>
          {flatList.slice(scrollTop, scrollTop + 20).map((node, index) => {
            const actualIndex = index + scrollTop;
            const isSelected = actualIndex === selectedIndex && focused;
            const prefix = "  ".repeat(node.level);
            const fileIcon = getFileIconSimple(node.name, node.isDirectory, node.expanded);
            const gitStatus = gitStatuses.get(node.path);

            // Color based on selection and git status
            let nameFg: string;
            if (isSelected) {
              nameFg = "white";
            } else if (node.isDirectory) {
              nameFg = "yellow";
            } else if (gitStatus) {
              nameFg = getFileStatusColor(gitStatus);
            } else {
              nameFg = "white";
            }

            const bg = isSelected ? "blue" : undefined;
            const iconColor = isSelected ? "cyan" : fileIcon.color;

            return (
              <box
                key={node.path}
                style={{ flexDirection: "row", bg: bg as any, paddingX: 1 }}
                onMouseDown={() => {
                  // Select this item
                  setSelectedIndex(actualIndex);

                  // Single click focuses the panel
                  if (onFocus) onFocus();

                  // Single click opens files / toggles folders (more intuitive)
                  if (node.isDirectory) {
                    // Toggle expand/collapse
                    const toggleExpand = (nodes: FileNode[]): FileNode[] => {
                      return nodes.map((n) => {
                        if (n.path === node.path) {
                          const expanded = !n.expanded;
                          return {
                            ...n,
                            expanded,
                            children: expanded ? buildTree(n.path, n.level + 1) : [],
                          };
                        }
                        if (n.children) {
                          return { ...n, children: toggleExpand(n.children) };
                        }
                        return n;
                      });
                    };
                    setTree(toggleExpand(tree));
                  } else {
                    // Open file
                    onFileSelect(node.path);
                  }
                }}
              >
                <text style={{ fg: isSelected ? "cyan" : "gray" }}>{prefix}</text>
                <text style={{ fg: isSelected ? "cyan" : iconColor as any }}>{fileIcon.icon} </text>
                <text style={{ fg: isSelected ? "cyan" : (gitStatus ? getFileStatusColor(gitStatus) : "gray") as any }}>
                  {gitStatus ? (getFileStatusIcon(gitStatus).trim()[0] || " ") : " "}
                </text>
                <text style={{ fg: isSelected ? "cyan" : nameFg as any, bold: isSelected }}>
                  {" "}{node.name}
                </text>
              </box>
            );
          })}
        </scrollbox>

        {/* Scrollbar */}
        {flatList.length > 20 && (
          <box style={{ width: 1, height: "100%", flexDirection: "column", bg: "#050505", borderLeft: true, borderColor: "gray", dim: true }}>
            {(() => {
              const visibleCount = 20;
              const scrollPercentage = scrollTop / (flatList.length - visibleCount);
              const thumbHeight = Math.max(1, Math.floor((visibleCount / flatList.length) * visibleCount));
              const thumbPos = Math.floor(scrollPercentage * (visibleCount - thumbHeight));

              return Array.from({ length: visibleCount }).map((_, i) => {
                const isThumb = i >= thumbPos && i < thumbPos + thumbHeight;
                return (
                  <text key={i} style={{ fg: isThumb ? "cyan" : "gray", dim: !isThumb }}>
                    {isThumb ? "█" : "│"}
                  </text>
                );
              });
            })()}
          </box>
        )}
      </box>
    </box>

  );
}
