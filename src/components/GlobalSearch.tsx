import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";

interface GlobalSearchProps {
  rootPath: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (filePath: string, lineNumber: number) => void;
}

interface SearchResult {
  filePath: string;
  relativePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

// Collect all text files recursively
function collectTextFiles(
  dirPath: string,
  rootPath: string,
  maxDepth: number = 10,
  depth: number = 0
): string[] {
  if (depth > maxDepth) return [];

  const files: string[] = [];
  const textExtensions = new Set([
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts",
    ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml",
    ".html", ".htm", ".css", ".scss", ".sass", ".less",
    ".md", ".markdown", ".txt", ".rst",
    ".py", ".rs", ".go", ".rb", ".php", ".java", ".kt", ".swift",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".lua", ".zig",
    ".sh", ".bash", ".zsh", ".fish",
    ".sql", ".graphql", ".gql",
    ".env", ".gitignore", ".dockerignore",
  ]);

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        files.push(...collectTextFiles(fullPath, rootPath, maxDepth, depth + 1));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (textExtensions.has(ext) || entry.name.includes(".")) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Ignore permission errors
  }

  return files;
}

export function GlobalSearch({ rootPath, isOpen, onClose, onSelect }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [allFiles, setAllFiles] = useState<string[]>([]);

  // Collect files when opened
  useEffect(() => {
    if (isOpen) {
      const files = collectTextFiles(rootPath, rootPath);
      setAllFiles(files);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen, rootPath]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);

      const searchResults: SearchResult[] = [];
      const queryLower = query.toLowerCase();
      const maxResults = 100;
      const maxResultsPerFile = 10;

      for (const filePath of allFiles) {
        if (searchResults.length >= maxResults) break;

        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const lines = content.split("\n");
          let fileResults = 0;

          for (let i = 0; i < lines.length && fileResults < maxResultsPerFile; i++) {
            const line = lines[i];
            const lineLower = line.toLowerCase();
            const matchIndex = lineLower.indexOf(queryLower);

            if (matchIndex !== -1) {
              searchResults.push({
                filePath,
                relativePath: path.relative(rootPath, filePath),
                lineNumber: i + 1,
                lineContent: line.trim().slice(0, 100),
                matchStart: matchIndex,
                matchEnd: matchIndex + query.length,
              });
              fileResults++;

              if (searchResults.length >= maxResults) break;
            }
          }
        } catch {
          // Ignore unreadable files
        }
      }

      setResults(searchResults);
      setIsSearching(false);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query, allFiles, rootPath]);

  // Handle keyboard
  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      onClose();
      return;
    }

    if (event.name === "return") {
      if (results[selectedIndex]) {
        const result = results[selectedIndex];
        onSelect(result.filePath, result.lineNumber);
        onClose();
      }
      return;
    }

    if (event.name === "up" || (event.ctrl && event.name === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (event.name === "down" || (event.ctrl && event.name === "n")) {
      setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
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

  const visibleResults = results.slice(0, 15);

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bg: "black",
      }}
    >
    <box
      style={{
        position: "absolute",
        top: 3,
        left: 5,
        right: 5,
        height: 22,
        flexDirection: "column",
        border: true,
        borderColor: "green",
        bg: "black",
      }}
    >
      {/* Search input */}
      <box style={{ paddingX: 1, borderBottom: true, borderColor: "gray" }}>
        <text style={{ fg: "green" }}>🔎 </text>
        <text style={{ fg: "white" }}>{query}</text>
        <text style={{ fg: "green", blink: true }}>▌</text>
        {isSearching && <text style={{ fg: "yellow" }}> Searching...</text>}
      </box>

      {/* Results */}
      <scrollbox style={{ flexDirection: "column", flexGrow: 1, paddingX: 1 }}>
        {query.length < 2 ? (
          <text style={{ fg: "gray", dim: true }}>Type at least 2 characters to search</text>
        ) : results.length === 0 && !isSearching ? (
          <text style={{ fg: "gray", dim: true }}>No results found</text>
        ) : (
          visibleResults.map((result, index) => {
            const isSelected = index === selectedIndex;

            return (
              <box
                key={`${result.filePath}-${result.lineNumber}`}
                style={{
                  flexDirection: "column",
                  bg: isSelected ? "green" : undefined,
                  paddingY: 0,
                }}
              >
                <box style={{ flexDirection: "row" }}>
                  <text style={{ fg: isSelected ? "black" : "gray" }}>
                    {isSelected ? "▸ " : "  "}
                  </text>
                  <text style={{ fg: isSelected ? "black" : "cyan" }}>
                    {result.relativePath}
                  </text>
                  <text style={{ fg: isSelected ? "black" : "yellow" }}>
                    :{result.lineNumber}
                  </text>
                </box>
                <box style={{ paddingLeft: 4 }}>
                  <text style={{ fg: isSelected ? "black" : "gray", dim: !isSelected }}>
                    {result.lineContent.slice(0, 70)}
                    {result.lineContent.length > 70 ? "..." : ""}
                  </text>
                </box>
              </box>
            );
          })
        )}
      </scrollbox>

      {/* Footer */}
      <box style={{ paddingX: 1, borderTop: true, borderColor: "gray" }}>
        <text style={{ fg: "gray", dim: true }}>
          {results.length} results | ↑↓ select | Enter open | Esc close
        </text>
      </box>
    </box>
    </box>
  );
}
