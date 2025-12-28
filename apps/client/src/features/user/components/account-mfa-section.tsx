import React from "react";
import { Alert } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

// EE功能已移除 - 内网部署版本
export function AccountMfaSection() {
  return (
    <Alert icon={<IconInfoCircle />} title="功能不可用" color="gray">
      MFA功能在当前版本中不可用
    </Alert>
  );
}
