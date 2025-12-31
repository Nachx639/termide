import React, { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  expanded?: boolean;
  level: number;
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

  useEffect(() => {
    setTree(buildTree(rootPath));
  }, [rootPath]);

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
          const icon = node.isDirectory ? (node.expanded ? "▼ " : "▶ ") : "  ";
          const fg = isSelected ? "black" : node.isDirectory ? "yellow" : "white";
          const bg = isSelected ? "cyan" : undefined;

          return (
            <text key={node.path} style={{ fg, bg }}>
              {prefix}{icon}{node.name}
            </text>
          );
        })}
      </scrollbox>
    </box>
  );
}
