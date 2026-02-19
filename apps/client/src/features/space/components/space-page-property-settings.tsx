import { Button, Group, TagsInput, Text } from "@mantine/core";
import React, { useEffect, useState } from "react";
import {
  useSpacePagePropertyStatusConfigQuery,
  useUpdateSpacePagePropertyStatusConfigMutation,
} from "@/features/space/queries/space-query.ts";
import {
  ResponsiveSettingsContent,
  ResponsiveSettingsControl,
  ResponsiveSettingsRow,
} from "@/components/ui/responsive-settings-row.tsx";
import { useTranslation } from "react-i18next";

interface SpacePagePropertySettingsProps {
  spaceId: string;
  readOnly?: boolean;
}

export default function SpacePagePropertySettings({
  spaceId,
  readOnly,
}: SpacePagePropertySettingsProps) {
  const { t } = useTranslation();
  const { data } = useSpacePagePropertyStatusConfigQuery(spaceId);
  const updateMutation = useUpdateSpacePagePropertyStatusConfigMutation();
  const [statusOptions, setStatusOptions] = useState<string[]>([]);

  useEffect(() => {
    if (data?.statusOptions) {
      setStatusOptions(data.statusOptions);
    }
  }, [data?.statusOptions]);

  const handleSave = async () => {
    await updateMutation.mutateAsync({ spaceId, statusOptions });
  };

  return (
    <ResponsiveSettingsRow>
      <ResponsiveSettingsContent>
        <Text size="md">{t("Page Properties")}</Text>
        <Text size="sm" c="dimmed">
          {t("Manage status options for page properties in this space.")}
        </Text>
      </ResponsiveSettingsContent>

      <ResponsiveSettingsControl>
        <div style={{ minWidth: 320 }}>
          <TagsInput
            value={statusOptions}
            onChange={setStatusOptions}
            disabled={readOnly}
            placeholder={t("Enter status and press Enter")}
            mb="sm"
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              onClick={handleSave}
              disabled={readOnly || statusOptions.length === 0}
              loading={updateMutation.isPending}
            >
              {t("Save")}
            </Button>
          </Group>
        </div>
      </ResponsiveSettingsControl>
    </ResponsiveSettingsRow>
  );
}
