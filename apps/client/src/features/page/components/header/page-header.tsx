import classes from "./page-header.module.css";
import PageHeaderMenu from "@/features/page/components/header/page-header-menu.tsx";
import PageHeaderUserMenu from "@/features/page/components/header/page-header-user-menu.tsx";
import { Group } from "@mantine/core";
import Breadcrumb from "@/features/page/components/breadcrumbs/breadcrumb.tsx";

interface Props {
  readOnly?: boolean;
}
export default function PageHeader({ readOnly }: Props) {
  return (
    <div className={classes.header}>
      <div className={classes.breadcrumbWrapper}>
        <Breadcrumb />
      </div>

      <div className={classes.toolbarWrapper}>
        <Group justify="center" h="100%" wrap="nowrap" gap="var(--mantine-spacing-xs)">
          <PageHeaderMenu readOnly={readOnly} />
        </Group>
      </div>

      <div className={classes.menuWrapper}>
        <PageHeaderUserMenu />
      </div>
    </div>
  );
}
