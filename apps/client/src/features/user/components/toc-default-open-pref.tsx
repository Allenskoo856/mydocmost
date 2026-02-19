import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import { Switch, Text } from "@mantine/core";
import { useAtom } from "jotai";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveSettingsContent,
  ResponsiveSettingsControl,
  ResponsiveSettingsRow,
} from "@/components/ui/responsive-settings-row";

export default function TocDefaultOpenPref() {
  const { t } = useTranslation();

  return (
    <ResponsiveSettingsRow>
      <ResponsiveSettingsContent>
        <Text size="md">{t("Open table of contents by default")}</Text>
        <Text size="sm" c="dimmed">
          {t("Automatically expand the table of contents when opening pages.")}
        </Text>
      </ResponsiveSettingsContent>

      <ResponsiveSettingsControl>
        <TocDefaultOpenToggle />
      </ResponsiveSettingsControl>
    </ResponsiveSettingsRow>
  );
}

function TocDefaultOpenToggle() {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const preferenceValue = user?.settings?.preferences?.tocDefaultOpen ?? false;
  const [checked, setChecked] = useState(preferenceValue);

  useEffect(() => {
    if (checked !== preferenceValue) {
      setChecked(preferenceValue);
    }
  }, [checked, preferenceValue]);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    const updatedUser = await updateUser({ tocDefaultOpen: value });
    setChecked(value);
    setUser(updatedUser);
  };

  return (
    <Switch
      checked={checked}
      onChange={handleChange}
      aria-label={t("Toggle default table of contents")}
    />
  );
}
