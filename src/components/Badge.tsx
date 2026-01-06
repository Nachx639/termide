import React from "react";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

interface BadgeProps {
  /** Badge text */
  children: React.ReactNode;
  /** Badge variant/color */
  variant?: BadgeVariant;
  /** Custom foreground color */
  fg?: string;
  /** Custom background color */
  bg?: string;
  /** Whether to show border */
  bordered?: boolean;
  /** Whether text is bold */
  bold?: boolean;
  /** Whether text is dimmed */
  dim?: boolean;
  /** Icon to show before text */
  icon?: string;
}

const VARIANT_COLORS: Record<BadgeVariant, { fg: string; bg?: string }> = {
  default: { fg: "gray" },
  success: { fg: "green" },
  warning: { fg: "yellow" },
  error: { fg: "red" },
  info: { fg: "cyan" },
};

/**
 * Badge component for status indicators.
 *
 * @example
 * ```tsx
 * <Badge variant="success">Connected</Badge>
 * <Badge variant="error" icon="●">Error</Badge>
 * <Badge fg="magenta" bordered>Custom</Badge>
 * ```
 */
export function Badge({
  children,
  variant = "default",
  fg,
  bg,
  bordered = false,
  bold = false,
  dim = false,
  icon,
}: BadgeProps) {
  const colors = VARIANT_COLORS[variant];
  const finalFg = fg || colors.fg;
  const finalBg = bg || colors.bg;

  const content = (
    <>
      {icon && <text style={{ fg: finalFg as React.CSSProperties["color"] }}>{icon} </text>}
      <text
        style={{
          fg: finalFg as React.CSSProperties["color"],
          bg: finalBg as React.CSSProperties["color"],
          bold,
          dim,
        }}
      >
        {children}
      </text>
    </>
  );

  if (bordered) {
    return (
      <box
        style={{
          flexDirection: "row",
          borderStyle: "round",
          borderColor: finalFg as React.CSSProperties["color"],
          paddingX: 1,
        }}
      >
        {content}
      </box>
    );
  }

  return <box style={{ flexDirection: "row" }}>{content}</box>;
}

interface StatusBadgeProps {
  /** Status type */
  status: "online" | "offline" | "busy" | "away" | "error";
  /** Optional label text */
  label?: string;
  /** Show dot indicator */
  showDot?: boolean;
}

const STATUS_CONFIG: Record<
  StatusBadgeProps["status"],
  { color: string; label: string; dot: string }
> = {
  online: { color: "green", label: "Online", dot: "●" },
  offline: { color: "gray", label: "Offline", dot: "○" },
  busy: { color: "red", label: "Busy", dot: "●" },
  away: { color: "yellow", label: "Away", dot: "◐" },
  error: { color: "red", label: "Error", dot: "✕" },
};

/**
 * Pre-configured status badge.
 *
 * @example
 * ```tsx
 * <StatusBadge status="online" />
 * <StatusBadge status="error" label="Connection lost" />
 * ```
 */
export function StatusBadge({
  status,
  label,
  showDot = true,
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      {showDot && (
        <text style={{ fg: config.color as React.CSSProperties["color"] }}>
          {config.dot}
        </text>
      )}
      <text style={{ fg: config.color as React.CSSProperties["color"] }}>
        {label || config.label}
      </text>
    </box>
  );
}

interface CountBadgeProps {
  /** Count number */
  count: number;
  /** Maximum count to show (shows "99+" style) */
  max?: number;
  /** Color */
  color?: string;
  /** Whether to hide when count is 0 */
  hideZero?: boolean;
}

/**
 * Badge showing a count number.
 *
 * @example
 * ```tsx
 * <CountBadge count={5} />
 * <CountBadge count={150} max={99} />
 * ```
 */
export function CountBadge({
  count,
  max = 99,
  color = "cyan",
  hideZero = true,
}: CountBadgeProps) {
  if (hideZero && count === 0) return null;

  const displayCount = count > max ? `${max}+` : String(count);

  return (
    <text style={{ fg: color as React.CSSProperties["color"], bold: true }}>
      [{displayCount}]
    </text>
  );
}

interface KeyBadgeProps {
  /** Key combination (e.g., "Ctrl+P") */
  keys: string;
  /** Color */
  color?: string;
}

/**
 * Badge for showing keyboard shortcuts.
 *
 * @example
 * ```tsx
 * <KeyBadge keys="Ctrl+P" />
 * <KeyBadge keys="Esc" color="yellow" />
 * ```
 */
export function KeyBadge({ keys, color = "cyan" }: KeyBadgeProps) {
  return (
    <text style={{ fg: color as React.CSSProperties["color"], bold: true }}>
      {keys}
    </text>
  );
}
