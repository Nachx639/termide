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

export function FileTree({ rootPath, onFileSelect, focused }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
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
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (event.name === "down" || event.name === "j") {
      setSelectedIndex((i) => Math.min(flatList.length - 1, i + 1));
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
  });

  const borderColor = focused ? "cyan" : "gray";

  return (
    <box style={{ flexDirection: "column", border: true, borderColor }}>
      <box style={{ paddingX: 1 }}>
        <text style={{ fg: "cyan", bold: true }}>Explorer</text>
      </box>
      <scrollbox style={{ flexDirection: "column", paddingX: 1, flexGrow: 1 }}>
        {flatList.map((node, index) => {
          const isSelected = index === selectedIndex && focused;
          const prefix = "  ".repeat(node.level);
          const fileIcon = getFileIconSimple(node.name, node.isDirectory, node.expanded);
          const gitStatus = gitStatuses.get(node.path);

          // Color based on selection and git status
          let nameFg: string;
          if (isSelected) {
            nameFg = "white"; // White text on selection for visibility
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
            <box key={node.path} style={{ flexDirection: "row", bg: bg as any, paddingX: 1 }}>
              <text style={{ fg: isSelected ? "cyan" : "gray" }}>{prefix}</text>
              <text style={{ fg: isSelected ? "cyan" : iconColor as any }}>{fileIcon.icon} </text>

              {/* Git Status - Fixed width to prevent jumping */}
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
    </box>
  );
}
