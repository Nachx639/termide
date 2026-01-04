import React, { useState, useEffect, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import { type SymbolLocation, getSymbolIcon, getSymbolColor } from "../lib/SymbolFinder";

interface SymbolPickerProps {
    symbols: SymbolLocation[];
    isOpen: boolean;
    onClose: () => void;
    onSelect: (symbol: SymbolLocation) => void;
}

function fuzzyMatch(text: string, query: string): boolean {
    if (!query) return true;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let queryIndex = 0;
    for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
        if (lowerText[i] === lowerQuery[queryIndex]) {
            queryIndex++;
        }
    }
    return queryIndex === lowerQuery.length;
}

function fuzzyScore(text: string, query: string): number {
    if (!query) return 0;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let score = 0;
    let queryIndex = 0;
    let consecutiveBonus = 0;

    for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
        if (lowerText[i] === lowerQuery[queryIndex]) {
            score += 1 + consecutiveBonus;
            consecutiveBonus += 0.5;
            queryIndex++;

            // Bonus for matching at start
            if (i === 0) score += 2;
            // Bonus for matching after separator
            if (i > 0 && /[_\-\s]/.test(lowerText[i - 1]!)) score += 1.5;
            // Bonus for matching uppercase (camelCase)
            if (text[i] === text[i]!.toUpperCase() && text[i]!.toLowerCase() !== text[i]!.toUpperCase()) score += 1;
        } else {
            consecutiveBonus = 0;
        }
    }

    return queryIndex === lowerQuery.length ? score : 0;
}

export function SymbolPicker({ symbols, isOpen, onClose, onSelect }: SymbolPickerProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Filter and sort symbols based on query
    const filteredSymbols = useMemo(() => {
        if (!query) return symbols;

        return symbols
            .map(symbol => ({ symbol, score: fuzzyScore(symbol.symbolName, query) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.symbol);
    }, [symbols, query]);

    // Reset selection when filtered results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredSymbols]);

    // Reset query when opening
    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setSelectedIndex(0);
        }
    }, [isOpen]);

    useKeyboard((event) => {
        if (!isOpen) return;

        if (event.name === "escape") {
            onClose();
            return;
        }

        if (event.name === "return") {
            const selected = filteredSymbols[selectedIndex];
            if (selected) {
                onSelect(selected);
                onClose();
            }
            return;
        }

        if (event.name === "up" || (event.ctrl && event.name === "p")) {
            setSelectedIndex(i => Math.max(0, i - 1));
            return;
        }

        if (event.name === "down" || (event.ctrl && event.name === "n")) {
            setSelectedIndex(i => Math.min(filteredSymbols.length - 1, i + 1));
            return;
        }

        if (event.name === "backspace") {
            setQuery(q => q.slice(0, -1));
            return;
        }

        // Handle character input
        if (event.sequence && event.sequence.length === 1 && !event.ctrl && !event.meta) {
            setQuery(q => q + event.sequence);
            return;
        }

        if (event.name === "space") {
            setQuery(q => q + " ");
            return;
        }
    });

    if (!isOpen) return null;

    const maxVisible = 10;
    const startIndex = Math.max(0, Math.min(selectedIndex - 4, filteredSymbols.length - maxVisible));
    const visibleSymbols = filteredSymbols.slice(startIndex, startIndex + maxVisible);

    return (
        <box
            style={{
                position: "absolute",
                top: 2,
                left: "20%",
                width: "60%",
                flexDirection: "column",
                border: true,
                borderColor: "cyan",
                bg: "#1e1e1e",
                zIndex: 100,
            }}
        >
            {/* Header */}
            <box style={{ paddingX: 1, height: 1, bg: "#2a2a2a", flexDirection: "row" }}>
                <text style={{ fg: "cyan", bold: true }}>@ Go to Symbol</text>
                <text style={{ fg: "gray", dim: true }}> ({filteredSymbols.length} symbols)</text>
            </box>

            {/* Search input */}
            <box style={{ paddingX: 1, height: 1, bg: "#252526", flexDirection: "row" }}>
                <text style={{ fg: "cyan" }}>@</text>
                <text style={{ fg: "white" }}>{query}</text>
                <text style={{ fg: "cyan", bold: true }}>│</text>
            </box>

            {/* Results */}
            <box style={{ flexDirection: "column", maxHeight: maxVisible, paddingX: 1 }}>
                {filteredSymbols.length === 0 ? (
                    <text style={{ fg: "gray", dim: true, padding: 1 }}>No symbols found</text>
                ) : (
                    visibleSymbols.map((symbol, idx) => {
                        const actualIndex = startIndex + idx;
                        const isSelected = actualIndex === selectedIndex;
                        const icon = getSymbolIcon(symbol.kind);
                        const iconColor = getSymbolColor(symbol.kind);

                        return (
                            <box
                                key={`${symbol.symbolName}-${symbol.line}`}
                                style={{
                                    flexDirection: "row",
                                    bg: isSelected ? "#094771" : undefined as any,
                                    paddingX: 1,
                                }}
                            >
                                <text style={{ fg: iconColor as any, bold: true }}>{icon} </text>
                                <text style={{ fg: isSelected ? "white" : "#cccccc" as any, bold: isSelected }}>
                                    {symbol.symbolName}
                                </text>
                                <text style={{ fg: "gray", dim: true }}> :{symbol.line + 1}</text>
                                <text style={{ fg: "#6a6a6a", dim: true }}> ({symbol.kind})</text>
                            </box>
                        );
                    })
                )}
            </box>

            {/* Footer */}
            <box style={{ paddingX: 1, height: 1, bg: "#252526", flexDirection: "row" }}>
                <text style={{ fg: "gray", dim: true }}>↑↓ navigate • Enter select • Esc close</text>
            </box>
        </box>
    );
}
