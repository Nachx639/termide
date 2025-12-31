import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";

interface FuzzyFinderProps {
  rootPath: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (filePath: string) => void;
  recentFiles?: string[];
}

interface FileMatch {
  path: string;
  relativePath: string;
  score: number;
  highlights: number[];
  isRecent?: boolean;
}

// Simple fuzzy matching algorithm
function fuzzyMatch(pattern: string, text: string): { score: number; highlights: number[] } | null {
  if (pattern.length === 0) return { score: 1, highlights: [] };

  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();
  const highlights: number[] = [];

  let patternIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;
  let consecutiveBonus = 0;

  for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
    if (textLower[i] === patternLower[patternIdx]) {
      highlights.push(i);

      // Bonus for consecutive matches
      if (lastMatchIdx === i - 1) {
        consecutiveBonus += 5;
      } else {
        consecutiveBonus = 0;
      }

      // Bonus for matching at start of word
      if (i === 0 || text[i - 1] === "/" || text[i - 1] === "_" || text[i - 1] === "-" || text[i - 1] === ".") {
        score += 10;
      }

      // Bonus for case match
      if (text[i] === pattern[patternIdx]) {
        score += 1;
      }

      score += 1 + consecutiveBonus;
      lastMatchIdx = i;
      patternIdx++;
    }
  }

  if (patternIdx !== pattern.length) return null;

  // Bonus for shorter paths
  score -= text.length * 0.1;

  // Bonus for filename match
  const filename = text.split("/").pop() || "";
  if (filename.toLowerCase().includes(patternLower)) {
    score += 20;
  }

  return { score, highlights };
}

// Recursively collect all files
function collectFiles(
  dirPath: string,
  rootPath: string,
  maxDepth: number = 10,
  depth: number = 0
): string[] {
  if (depth > maxDepth) return [];

  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files/folders and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        files.push(...collectFiles(fullPath, rootPath, maxDepth, depth + 1));
      } else {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }

  return files;
}

export function FuzzyFinder({ rootPath, isOpen, onClose, onSelect, recentFiles = [] }: FuzzyFinderProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allFiles, setAllFiles] = useState<string[]>([]);

  // Collect files when opened
  useEffect(() => {
    if (isOpen) {
      const files = collectFiles(rootPath, rootPath);
      setAllFiles(files);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen, rootPath]);

  // Compute matches
  const matches = useMemo(() => {
    if (!query.trim()) {
      // Show recent files first, then other files
      const recentSet = new Set(recentFiles);
      const recentResults = recentFiles
        .filter((f) => fs.existsSync(f))
        .map((filePath) => ({
          path: filePath,
          relativePath: path.relative(rootPath, filePath),
          score: 1000, // High score for recent
          highlights: [],
          isRecent: true,
        }));

      const otherResults = allFiles
        .filter((f) => !recentSet.has(f))
        .slice(0, 100 - recentResults.length)
        .map((filePath) => ({
          path: filePath,
          relativePath: path.relative(rootPath, filePath),
          score: 0,
          highlights: [],
          isRecent: false,
        }));

      return [...recentResults, ...otherResults];
    }

    const results: FileMatch[] = [];

    for (const filePath of allFiles) {
      const relativePath = path.relative(rootPath, filePath);
      const match = fuzzyMatch(query, relativePath);

      if (match) {
        results.push({
          path: filePath,
          relativePath,
          score: match.score,
          highlights: match.highlights,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, 50);
  }, [query, allFiles, rootPath]);

  // Handle keyboard
  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      onClose();
      return;
    }

    if (event.name === "return") {
      if (matches[selectedIndex]) {
        onSelect(matches[selectedIndex].path);
        onClose();
      }
      return;
    }

    if (event.name === "up" || (event.ctrl && event.name === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (event.name === "down" || (event.ctrl && event.name === "n")) {
      setSelectedIndex((i) => Math.min(matches.length - 1, i + 1));
      return;
    }

    if (event.name === "backspace") {
      setQuery((q) => q.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    // Regular characters
    if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
      setQuery((q) => q + event.name);
      setSelectedIndex(0);
    }
  });

  if (!isOpen) return null;

  const visibleMatches = matches.slice(0, 15);

  const dimensions = useTerminalDimensions();
  const width = dimensions.width || 80;
  const height = dimensions.height || 24;

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <box
        style={{
          width: "80%",
          height: 20,
          flexDirection: "column",
          border: true,
          borderColor: "cyan",
          bg: "#0b0b0b",
          position: "relative",
        }}
      >
        {/* Absolute Backdrop of spaces to force terminal opacity */}
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            bg: "#1a1a1a",
            flexDirection: "column",
          }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <text key={i} style={{ bg: "#1a1a1a" }}>{" ".repeat(200)}</text>
          ))}
        </box>

        {/* Search input */}
        <box style={{ paddingX: 1, borderBottom: true, borderColor: "gray", bg: "#1a1a1a" }}>
          <text style={{ fg: "cyan", bg: "#1a1a1a" }}>🔍 </text>
          <text style={{ fg: "white", bg: "#1a1a1a" }}>{query}</text>
          <text style={{ fg: "cyan", blink: true, bg: "#1a1a1a" }}>▌</text>
        </box>

        {/* Results */}
        <scrollbox style={{ flexDirection: "column", flexGrow: 1, bg: "#1a1a1a" }}>
          {visibleMatches.length === 0 ? (
            <text style={{ fg: "gray", dim: true, bg: "#1a1a1a", paddingX: 1 }}>No files found</text>
          ) : (
            visibleMatches.map((match, index) => {
              const isSelected = index === selectedIndex;
              const parts: { text: string; highlight: boolean }[] = [];
              let lastIdx = 0;

              // Build highlighted string
              for (const highlightIdx of match.highlights) {
                if (highlightIdx > lastIdx) {
                  parts.push({ text: match.relativePath.slice(lastIdx, highlightIdx), highlight: false });
                }
                parts.push({ text: match.relativePath[highlightIdx], highlight: true });
                lastIdx = highlightIdx + 1;
              }
              if (lastIdx < match.relativePath.length) {
                parts.push({ text: match.relativePath.slice(lastIdx), highlight: false });
              }

              return (
                <box
                  key={match.path}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    bg: isSelected ? "cyan" : "#1a1a1a" as any,
                    width: "100%",
                    paddingX: 1,
                  }}
                >
                  <box style={{ flexDirection: "row", bg: isSelected ? "cyan" : "#1a1a1a" as any }}>
                    <text style={{ fg: isSelected ? "black" : "gray", bg: isSelected ? "cyan" : "#1a1a1a" as any }}>
                      {isSelected ? "▸ " : "  "}
                    </text>
                    {parts.length > 0 ? (
                      parts.map((part, i) => (
                        <text
                          key={i}
                          style={{
                            fg: isSelected
                              ? "black"
                              : part.highlight
                                ? "yellow"
                                : "white",
                            bg: isSelected ? "cyan" : "#1a1a1a" as any,
                            bold: part.highlight,
                          }}
                        >
                          {part.text}
                        </text>
                      ))
                    ) : (
                      <text style={{ fg: isSelected ? "black" : "white", bg: isSelected ? "cyan" : "#1a1a1a" as any }}>
                        {match.relativePath}
                      </text>
                    )}
                  </box>
                  {match.isRecent && (
                    <text style={{ fg: isSelected ? "black" : "magenta", bg: isSelected ? "cyan" : "#1a1a1a" as any, dim: !isSelected }}>
                      ★ recent
                    </text>
                  )}
                </box>
              );
            })
          )}
          {/* Filler to ensure background opacity */}
          <box style={{ flexGrow: 1, bg: "#0b0b0b" }}>
            <text style={{ bg: "#0b0b0b" }}> </text>
          </box>
        </scrollbox>

        {/* Footer */}
        <box style={{ paddingX: 1, borderTop: true, borderColor: "gray", bg: "#0b0b0b" }}>
          <text style={{ fg: "gray", dim: true, bg: "#0b0b0b" }}>
            {matches.length} files | ↑↓ select | Enter open | Esc close
          </text>
        </box>
      </box>
    </box>
  );
}
