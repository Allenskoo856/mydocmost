import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconCloudOff,
  IconCloudUpload,
  IconRefresh,
  IconWifiOff,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  collabReconnectAttemptAtom,
  collabSyncStatusAtom,
  yjsConnectionStatusAtom,
  type CollabConnectionStatus,
  type CollabSyncStatus,
} from "@/features/editor/atoms/editor-atoms";

interface CollabStatusIndicatorProps {
  onRetry?: () => void;
}

function connectionLabel(
  status: CollabConnectionStatus,
  attempt: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  switch (status) {
    case "connecting":
      return t("Connecting to real-time editor...");
    case "reconnecting":
      return attempt > 0
        ? t("Reconnecting to real-time editor (attempt {{count}})...", {
            count: attempt,
          })
        : t("Reconnecting to real-time editor...");
    case "disconnected":
      return t("Real-time editor connection lost. Retrying...");
    case "auth_failed":
      return t("Editor session expired. Refresh the page to continue.");
    case "connected":
      return t("Real-time editor connected");
    default:
      return "";
  }
}

function syncLabel(
  status: CollabSyncStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case "saving":
      return t("Saving changes...");
    case "offline_pending":
      return t("Unsynced changes. Will upload when reconnected.");
    case "synced":
      return t("All changes synced");
    default:
      return "";
  }
}

export default function CollabStatusIndicator({
  onRetry,
}: CollabStatusIndicatorProps) {
  const { t } = useTranslation();
  const [connectionStatus] = useAtom(yjsConnectionStatusAtom);
  const [syncStatus] = useAtom(collabSyncStatusAtom);
  const [reconnectAttempt] = useAtom(collabReconnectAttemptAtom);

  // Connected + healthy: stay silent. Only surface actionable/non-idle states.
  if (!connectionStatus || connectionStatus === "connected") {
    if (syncStatus === "saving") {
      return (
        <Tooltip label={syncLabel(syncStatus, t)} openDelay={150} withArrow>
          <ActionIcon
            variant="default"
            c="blue"
            style={{ border: "none", cursor: "default" }}
            aria-label={syncLabel(syncStatus, t)}
          >
            <IconCloudUpload size={20} stroke={2} />
          </ActionIcon>
        </Tooltip>
      );
    }

    if (syncStatus === "offline_pending") {
      return (
        <Tooltip label={syncLabel(syncStatus, t)} openDelay={150} withArrow>
          <ActionIcon
            variant="default"
            c="orange"
            style={{ border: "none", cursor: "default" }}
            aria-label={syncLabel(syncStatus, t)}
          >
            <IconCloudOff size={20} stroke={2} />
          </ActionIcon>
        </Tooltip>
      );
    }

    return null;
  }

  const hasPendingLocalChanges = syncStatus === "offline_pending";
  const label = hasPendingLocalChanges
    ? t("Unsynced changes. Reconnecting...")
    : connectionLabel(connectionStatus, reconnectAttempt, t);
  const isAuthFailed = connectionStatus === "auth_failed";
  const isConnecting =
    connectionStatus === "connecting" || connectionStatus === "reconnecting";
  const Icon = isAuthFailed
    ? IconWifiOff
    : hasPendingLocalChanges
      ? IconCloudOff
      : isConnecting
        ? IconRefresh
        : IconWifiOff;
  const color = isAuthFailed
    ? "red"
    : hasPendingLocalChanges
      ? "orange"
      : isConnecting
        ? "yellow.8"
        : "red";

  return (
    <Tooltip label={label} openDelay={100} withArrow>
      <ActionIcon
        variant="default"
        c={color}
        style={{ border: "none" }}
        onClick={() => {
          if (isAuthFailed) {
            window.location.reload();
            return;
          }
          onRetry?.();
        }}
        aria-label={label}
      >
        <Icon
          size={20}
          stroke={2}
          style={
            isConnecting && !hasPendingLocalChanges
              ? { animation: "collab-status-spin 1s linear infinite" }
              : undefined
          }
        />
      </ActionIcon>
    </Tooltip>
  );
}
