import React, { useState, useEffect } from "react";
import { ANIMATION } from "../lib/config";

interface LoadingSpinnerProps {
  /** Text to show next to spinner */
  text?: string;
  /** Size: "small" | "normal" | "large" */
  size?: "small" | "normal" | "large";
  /** Color of the spinner */
  color?: string;
  /** Custom animation frames */
  frames?: string[];
  /** Animation speed in ms */
  interval?: number;
}

/**
 * Animated loading spinner for terminal UI.
 *
 * @example
 * ```tsx
 * <LoadingSpinner text="Loading..." />
 * <LoadingSpinner size="small" color="cyan" />
 * ```
 */
export function LoadingSpinner({
  text,
  size = "normal",
  color = "cyan",
  frames = ANIMATION.SPINNER_FRAMES,
  interval = ANIMATION.SPINNER_INTERVAL,
}: LoadingSpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [frames.length, interval]);

  const sizeMultiplier = size === "small" ? 1 : size === "large" ? 2 : 1;
  const currentFrame = frames[frameIndex];

  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      <text style={{ fg: color as React.CSSProperties["color"] }}>
        {currentFrame}
      </text>
      {text && (
        <text style={{ fg: "gray" }}>
          {text}
        </text>
      )}
    </box>
  );
}

interface LoadingDotsProps {
  /** Text before the dots */
  text?: string;
  /** Number of dots */
  maxDots?: number;
  /** Animation speed in ms */
  interval?: number;
  /** Color */
  color?: string;
}

/**
 * Animated loading dots (Loading...).
 *
 * @example
 * ```tsx
 * <LoadingDots text="Loading" />
 * ```
 */
export function LoadingDots({
  text = "Loading",
  maxDots = 3,
  interval = 400,
  color = "gray",
}: LoadingDotsProps) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDots((prev) => (prev + 1) % (maxDots + 1));
    }, interval);

    return () => clearInterval(timer);
  }, [maxDots, interval]);

  return (
    <text style={{ fg: color as React.CSSProperties["color"] }}>
      {text}{".".repeat(dots)}
    </text>
  );
}

interface ProgressBarProps {
  /** Progress value (0-100) */
  progress: number;
  /** Width in characters */
  width?: number;
  /** Show percentage */
  showPercent?: boolean;
  /** Bar color */
  color?: string;
  /** Background color */
  bgColor?: string;
}

/**
 * Terminal progress bar.
 *
 * @example
 * ```tsx
 * <ProgressBar progress={75} width={20} />
 * ```
 */
export function ProgressBar({
  progress,
  width = 20,
  showPercent = true,
  color = "cyan",
  bgColor = "gray",
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const filled = Math.round((clampedProgress / 100) * width);
  const empty = width - filled;

  const filledBar = "█".repeat(filled);
  const emptyBar = "░".repeat(empty);

  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      <text style={{ fg: color as React.CSSProperties["color"] }}>{filledBar}</text>
      <text style={{ fg: bgColor as React.CSSProperties["color"] }}>{emptyBar}</text>
      {showPercent && (
        <text style={{ fg: "white" }}> {Math.round(clampedProgress)}%</text>
      )}
    </box>
  );
}

interface PulseTextProps {
  /** Text to pulse */
  children: React.ReactNode;
  /** Colors to cycle through */
  colors?: string[];
  /** Animation speed in ms */
  interval?: number;
}

/**
 * Text that pulses through colors.
 *
 * @example
 * ```tsx
 * <PulseText colors={["cyan", "blue", "magenta"]}>
 *   Connecting...
 * </PulseText>
 * ```
 */
export function PulseText({
  children,
  colors = ["cyan", "white", "gray"],
  interval = 500,
}: PulseTextProps) {
  const [colorIndex, setColorIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setColorIndex((prev) => (prev + 1) % colors.length);
    }, interval);

    return () => clearInterval(timer);
  }, [colors.length, interval]);

  return (
    <text style={{ fg: colors[colorIndex] as React.CSSProperties["color"] }}>
      {children}
    </text>
  );
}
