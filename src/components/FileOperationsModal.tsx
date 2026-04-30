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

    if (event.name === "return") {
      executeOperation();
      return;
    }

    if (event.name === "backspace") {
      setInputValue(prev => prev.slice(0, -1));
      return;
    }

    // Regular characters
    if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
      setInputValue(prev => prev + event.name);
    }
  });

  const executeOperation = () => {
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
          if (fs.existsSync(newPath) && newPath !== targetPath) {
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
      case "rename": return "✏️ Rename";
      case "delete": return "🗑️ Delete";
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
          width: Math.min(60, width - 4),
          height: isDeleteConfirm ? 7 : 6,
          flexDirection: "column",
          border: true,
          borderColor: operation === "delete" ? "red" : "cyan",
          backgroundColor: "#050505",
          position: "relative",
        }}
      >
        {/* Backdrop */}
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "#050505",
            flexDirection: "column",
          }}
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <text key={i} style={{ bg: "#050505" }}>{" ".repeat(100)}</text>
          ))}
        </box>

        {/* Header */}
        <box style={{ paddingX: 1, border: ["bottom"], borderColor: "gray", backgroundColor: "#1a1a1a" }}>
          <text style={{ fg: operation === "delete" ? "red" : "cyan", attributes: TextAttributes.BOLD, bg: "#1a1a1a" }}>
            {getTitle()}
          </text>
        </box>

        {/* Content */}
        <box style={{ paddingX: 2, paddingY: 1, flexDirection: "column", backgroundColor: "#050505" }}>
          <text style={{ fg: "white", bg: "#050505" }}>{getPrompt()}</text>

          {isDeleteConfirm ? (
            <box style={{ marginTop: 1, flexDirection: "row", backgroundColor: "#050505" }}>
              <text style={{ fg: "gray", bg: "#050505" }}>Press </text>
              <text style={{ fg: "red", attributes: TextAttributes.BOLD, bg: "#050505" }}>Enter</text>
              <text style={{ fg: "gray", bg: "#050505" }}> to confirm or </text>
              <text style={{ fg: "cyan", attributes: TextAttributes.BOLD, bg: "#050505" }}>Esc</text>
              <text style={{ fg: "gray", bg: "#050505" }}> to cancel</text>
            </box>
          ) : (
            <box style={{ marginTop: 1, flexDirection: "row", backgroundColor: "#050505" }}>
              <text style={{ fg: "white", bg: "#050505" }}>{inputValue}</text>
              <text style={{ fg: "cyan", bg: "#050505" }}>▌</text>
            </box>
          )}
        </box>

        {/* Footer */}
        <box style={{ paddingX: 1, border: ["top"], borderColor: "gray", backgroundColor: "#0b0b0b" }}>
          <text style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#0b0b0b" }}>
            {isDeleteConfirm ? "⚠️ This action cannot be undone" : "Enter: confirm | Esc: cancel"}
          </text>
        </box>
      </box>
    </box>
  );
}
