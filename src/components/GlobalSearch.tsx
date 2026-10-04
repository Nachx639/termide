import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { searchInFiles, type TextMatch } from "../lib/textSearch";

interface GlobalSearchProps {
  rootPath: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (filePath: string, lineNumber: number) => void;
}

type SearchResult = TextMatch;

export function GlobalSearch({ rootPath, isOpen, onClose, onSelect }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen, rootPath]);

  // Debounced search: ripgrep / git grep in a subprocess (it used to read every
  // file synchronously on the UI thread for each query). A newer query cancels
  // the running one.
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      const found = await searchInFiles(rootPath, query, { maxResults: 100, maxPerFile: 10, signal: controller.signal });
      if (controller.signal.aborted) return;
      setResults(found);
      setSelectedIndex(0);
      setIsSearching(false);
    }, 150);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, rootPath]);

  // Navigation + close (input handles typing/backspace/paste natively)
  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      onClose();
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
  });

  if (!isOpen) return null;

  const visibleResults = results.slice(0, 15);

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
          width: "90%",
          height: 22,
          flexDirection: "column",
          border: true,
          borderColor: "green",
          backgroundColor: "#0b0b0b",
          position: "relative",
        }}
      >

        {/* Search input (native <input>) */}
        <box style={{ paddingX: 1, height: 2, flexShrink: 0, border: ["bottom"], borderColor: "gray", backgroundColor: "#1a1a1a", flexDirection: "row" }}>
          <text style={{ fg: "green", bg: "#1a1a1a" }}>🔎 </text>
          <input
            focused={isOpen}
            value={query}
            placeholder="Search across all files (min 2 chars)"
            onInput={(value: string) => { setQuery(value); setSelectedIndex(0); }}
            onSubmit={() => {
              if (results[selectedIndex]) {
                const result = results[selectedIndex];
                onSelect(result.filePath, result.lineNumber);
                onClose();
              }
            }}
            style={{ flexGrow: 1, backgroundColor: "#1a1a1a", textColor: "white", placeholderColor: "gray", cursorColor: "green" }}
          />
          {isSearching && <text style={{ fg: "#d4a800", bg: "#1a1a1a" }}> Searching...</text>}
        </box>

        {/* Results */}
        <scrollbox
          style={{ flexDirection: "column", flexGrow: 1, backgroundColor: "#1a1a1a" }}
          onMouse={(event: any) => {
            // OpenTUI reports the wheel as type "scroll" with scroll.direction.
            if (event.type === "scroll") {
              if (event.scroll?.direction === "up") {
                setSelectedIndex(i => Math.max(0, i - 1));
              } else {
                setSelectedIndex(i => Math.min(results.length - 1, i + 1));
              }
            }
          }}
        >

          {query.length < 2 ? (
            <text style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#1a1a1a", paddingX: 1 } as any}>Type at least 2 characters to search</text>
          ) : results.length === 0 && !isSearching ? (
            <text style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#1a1a1a", paddingX: 1 } as any}>No results found</text>
          ) : (
            visibleResults.map((result, index) => {
              const isSelected = index === selectedIndex;

              return (
                <box
                  key={`${result.filePath}-${result.lineNumber}`}
                  style={{
                    flexDirection: "column",
                    backgroundColor: isSelected ? "green" : "#1a1a1a" as any,
                    width: "100%",
                    paddingX: 1,
                  }}
                >
                  <box style={{ flexDirection: "row", backgroundColor: isSelected ? "green" : "#1a1a1a" as any }}>
                    <text style={{ fg: isSelected ? "black" : "gray", bg: isSelected ? "green" : "#1a1a1a" as any }}>
                      {isSelected ? "▸ " : "  "}
                    </text>
                    <text style={{ fg: isSelected ? "black" : "cyan", bg: isSelected ? "green" : "#1a1a1a" as any }}>
                      {result.relativePath}
                    </text>
                    <text style={{ fg: isSelected ? "black" : "yellow", bg: isSelected ? "green" : "#1a1a1a" as any }}>
                      :{result.lineNumber}
                    </text>
                  </box>
                  <box style={{ paddingLeft: 4, backgroundColor: isSelected ? "green" : "#1a1a1a" as any }}>
                    <text style={{ fg: isSelected ? "black" : "gray", attributes: !isSelected ? TextAttributes.DIM : 0, bg: isSelected ? "green" : "#1a1a1a" as any }}>
                      {result.lineContent.slice(0, 70)}
                      {result.lineContent.length > 70 ? "..." : ""}
                    </text>
                  </box>
                </box>
              );
            })
          )}
          {/* Filler to ensure background opacity */}
          <box style={{ flexGrow: 1, backgroundColor: "#1a1a1a" }}>
            <text style={{ bg: "#1a1a1a" }}> </text>
          </box>
        </scrollbox>

        {/* Footer */}
        <box style={{ paddingX: 1, border: ["top"], borderColor: "gray", backgroundColor: "#0b0b0b" }}>
          <text style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#0b0b0b" }}>
            {results.length} results | ↑↓ select | Enter open | Esc close
          </text>
        </box>
      </box>
    </box>
  );
}
