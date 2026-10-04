import React, { useState, useEffect } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import * as fs from "fs";
import * as path from "path";

export type FileOperation = "create-file" | "create-folder" | "rename" | "delete";

interface FileOperationsModalProps {
  isOpen: boolean;
  operation: FileOperation;
  targetPath: string; // For create: parent folder. For rename/delete: target file/folder
  onClose: () => void;
  onSuccess: (newPath?: string) => void;
  onError: (message: string) => void;
}

export function FileOperationsModal({
  isOpen,
  operation,
  targetPath,
  onClose,
  onSuccess,
  onError
}: FileOperationsModalProps) {
  const [inputValue, setInputValue] = useState("");
  const currentInput = inputValue;
  const dimensions = useTerminalDimensions();

  // Reset input when opened
  useEffect(() => {
    if (isOpen) {
      if (operation === "rename") {
        setInputValue(path.basename(targetPath));
      } else {
        setInputValue("");
      }
    }
  }, [isOpen, operation, targetPath]);

  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      onClose();
      return;
    }

    // Name entry is the native <input> (submit via onSubmit); only the delete
    // confirmation needs Enter here.
    if (event.name === "return" && operation === "delete") {
      executeOperation();
    }
  });

  // The input hands over its value: state may lag a render behind fast typing.
  const executeOperation = (submitted?: string) => {
    const inputValue = submitted ?? currentInput;
    try {
      switch (operation) {
        case "create-file": {
          if (!inputValue.trim()) {
            onError("File name cannot be empty");
            return;
          }
          const newPath = path.join(targetPath, inputValue.trim());
          if (fs.existsSync(newPath)) {
            onError("File already exists");
            return;
          }
          // "dir/sub/file.ts" creates the folders too.
          fs.mkdirSync(path.dirname(newPath), { recursive: true });
          fs.writeFileSync(newPath, "");
          onSuccess(newPath);
          break;
        }

        case "create-folder": {
          if (!inputValue.trim()) {
            onError("Folder name cannot be empty");
            return;
          }
          const newPath = path.join(targetPath, inputValue.trim());
          if (fs.existsSync(newPath)) {
            onError("Folder already exists");
            return;
          }
          fs.mkdirSync(newPath, { recursive: true });
          onSuccess(newPath);
          break;
        }

        case "rename": {
          if (!inputValue.trim()) {
            onError("Name cannot be empty");
            return;
          }
          const parentDir = path.dirname(targetPath);
          const newPath = path.join(parentDir, inputValue.trim());
          // On case-insensitive file systems (macOS) "data.json" → "Data.json"
          // finds the same file: that is a case-only rename, not a clash.
          const sameFile = (() => {
            try {
              return fs.statSync(newPath).ino === fs.statSync(targetPath).ino;
            } catch {
              return false;
            }
          })();
          if (fs.existsSync(newPath) && newPath !== targetPath && !sameFile) {
            onError("A file with this name already exists");
            return;
          }
          fs.renameSync(targetPath, newPath);
          onSuccess(newPath);
          break;
        }

        case "delete": {
          const stats = fs.statSync(targetPath);
          if (stats.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(targetPath);
          }
          onSuccess();
          break;
        }
      }
    } catch (err: any) {
      onError(err.message || "Operation failed");
    }
  };

  if (!isOpen) return null;

  const width = dimensions.width || 80;
  const height = dimensions.height || 24;

  const getTitle = () => {
    switch (operation) {
      case "create-file": return "📄 New File";
      case "create-folder": return "📁 New Folder";
      case "rename": return "✎ Rename";
      case "delete": return "✖ Delete";
    }
  };

  const getPrompt = () => {
    switch (operation) {
      case "create-file": return "Enter file name:";
      case "create-folder": return "Enter folder name:";
      case "rename": return "Enter new name:";
      case "delete": return `Delete "${path.basename(targetPath)}"?`;
    }
  };

  const isDeleteConfirm = operation === "delete";
  const targetName = path.basename(targetPath);

  const accent = operation === "delete" ? "red" : "cyan";
  const row = { height: 1, flexShrink: 0, flexDirection: "row" as const, paddingX: 1, backgroundColor: "#050505" };

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
      {/* One line per row; the old padded/bordered rows needed 9 lines in a 6-line box
          and were squashed on top of each other. */}
      <box
        style={{
          width: Math.min(60, width - 4),
          height: 6,
          flexDirection: "column",
          border: true,
          borderColor: accent,
          backgroundColor: "#050505",
        }}
      >
        <box style={{ ...row, backgroundColor: "#1a1a1a" }}>
          <text style={{ fg: accent, attributes: TextAttributes.BOLD, bg: "#1a1a1a" }}>{getTitle()}</text>
        </box>
        <box style={row}>
          <text wrapMode="none" style={{ fg: "white", bg: "#050505" }}>{getPrompt()}</text>
        </box>
        {isDeleteConfirm ? (
          <box style={row}>
            <text style={{ fg: "gray", bg: "#050505" }}>Press </text>
            <text style={{ fg: "red", attributes: TextAttributes.BOLD, bg: "#050505" }}>Enter</text>
            <text style={{ fg: "gray", bg: "#050505" }}> to confirm or </text>
            <text style={{ fg: "cyan", attributes: TextAttributes.BOLD, bg: "#050505" }}>Esc</text>
            <text style={{ fg: "gray", bg: "#050505" }}> to cancel</text>
          </box>
        ) : (
          <box style={row}>
            <text style={{ fg: "cyan", bg: "#050505" }}>{"› "}</text>
            <input
              focused={isOpen}
              value={inputValue}
              onInput={(v: string) => setInputValue(v)}
              onSubmit={(v: any) => executeOperation(typeof v === "string" ? v : undefined)}
              style={{ flexGrow: 1, backgroundColor: "#050505", textColor: "white", cursorColor: "cyan" }}
            />
          </box>
        )}
        <box style={{ ...row, backgroundColor: "#0b0b0b" }}>
          <text style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#0b0b0b" }}>
            {isDeleteConfirm ? "⚠ This action cannot be undone" : "Enter: confirm | Esc: cancel"}
          </text>
        </box>
      </box>
    </box>
  );
}
