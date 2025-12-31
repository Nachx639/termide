import React, { useState, useEffect, useCallback } from "react";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number; // ms, 0 = persistent
}

interface NotificationsProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<NotificationType, { icon: string; fg: string; bg?: string }> = {
  info: { icon: "ℹ", fg: "cyan" },
  success: { icon: "✓", fg: "green" },
  warning: { icon: "⚠", fg: "yellow" },
  error: { icon: "✗", fg: "red" },
};

export function Notifications({ notifications, onDismiss }: NotificationsProps) {
  // Auto-dismiss notifications with duration
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    notifications.forEach((notification) => {
      if (notification.duration && notification.duration > 0) {
        const timer = setTimeout(() => {
          onDismiss(notification.id);
        }, notification.duration);
        timers.push(timer);
      }
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  return (
    <box
      style={{
        position: "absolute",
        bottom: 2,
        right: 2,
        flexDirection: "column",
        gap: 1,
      }}
    >
      {notifications.slice(-3).map((notification) => {
        const style = TYPE_STYLES[notification.type];

        return (
          <box
            key={notification.id}
            style={{
              flexDirection: "row",
              paddingX: 1,
              border: true,
              borderColor: style.fg as any,
              bg: "black",
            }}
          >
            <text style={{ fg: style.fg as any, bold: true }}>
              {style.icon}{" "}
            </text>
            <text style={{ fg: "white" }}>{notification.message}</text>
            <text style={{ fg: "gray", dim: true }}> [x]</text>
          </box>
        );
      })}
    </box>
  );
}

// Hook to manage notifications
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const notify = useCallback(
    (message: string, type: NotificationType = "info", duration: number = 3000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setNotifications((prev) => [...prev, { id, message, type, duration }]);
      return id;
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    notify,
    dismiss,
    dismissAll,
    info: (message: string, duration?: number) => notify(message, "info", duration),
    success: (message: string, duration?: number) => notify(message, "success", duration),
    warning: (message: string, duration?: number) => notify(message, "warning", duration),
    error: (message: string, duration?: number) => notify(message, "error", duration),
  };
}
