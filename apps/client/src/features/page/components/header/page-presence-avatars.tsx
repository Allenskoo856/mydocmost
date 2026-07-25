import { Avatar, Text, Tooltip } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  pagePresenceAtom,
  yjsConnectionStatusAtom,
  type PagePresenceUser,
} from "@/features/editor/atoms/editor-atoms";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";

const MAX_VISIBLE = 4;
const AVATAR_SIZE = 24;

function PresenceAvatar({
  user,
  label,
}: {
  user: PagePresenceUser;
  label: string;
}) {
  return (
    <Tooltip label={label} withArrow openDelay={150}>
      <CustomAvatar
        avatarUrl={user.avatarUrl || ""}
        name={user.name}
        size={AVATAR_SIZE}
        radius="xl"
        type={AvatarIconType.AVATAR}
        style={{
          border: `2px solid ${user.color}`,
          boxSizing: "border-box",
          cursor: "default",
          // Soften the local user so the strip stays scannable.
          opacity: user.isSelf ? 0.85 : 1,
        }}
      />
    </Tooltip>
  );
}

export default function PagePresenceAvatars() {
  const { t } = useTranslation();
  const [presence] = useAtom(pagePresenceAtom);
  const [connectionStatus] = useAtom(yjsConnectionStatusAtom);

  // Only show while the collab socket is healthy; reconnect UI owns the slot otherwise.
  if (connectionStatus !== "connected" || presence.length === 0) {
    return null;
  }

  const visible = presence.slice(0, MAX_VISIBLE);
  const overflow = presence.length - visible.length;

  return (
    <Avatar.Group spacing={8} visibleFrom="sm">
      {visible.map((user) => {
        const label = user.isSelf
          ? t("{{name}} (you) · Editing", { name: user.name })
          : t("{{name}} · Editing", { name: user.name });
        return <PresenceAvatar key={user.userId} user={user} label={label} />;
      })}
      {overflow > 0 && (
        <Tooltip
          label={t("+{{count}} more editing", { count: overflow })}
          withArrow
          openDelay={150}
        >
          <Avatar radius="xl" size={AVATAR_SIZE}>
            <Text size="xs">+{overflow}</Text>
          </Avatar>
        </Tooltip>
      )}
    </Avatar.Group>
  );
}
