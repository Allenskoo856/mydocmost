import { AppShell, Container, Transition } from "@mantine/core";
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import SettingsSidebar from "@/components/settings/settings-sidebar.tsx";
import { useAtom } from "jotai";
import {
  asideStateAtom,
  desktopSidebarAtom,
  mobileSidebarAtom,
  sidebarWidthAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { SpaceSidebar } from "@/features/space/components/sidebar/space-sidebar.tsx";
import { AppHeader } from "@/components/layouts/global/app-header.tsx";
import Aside from "@/components/layouts/global/aside.tsx";
import classes from "./app-shell.module.css";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";

export default function GlobalAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // useTrialEndAction removed for internal network deployment
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);
  const [desktopOpened] = useAtom(desktopSidebarAtom);
  const [{ isAsideOpen, tab: asideTab }] = useAtom(asideStateAtom);
  const [sidebarWidth, setSidebarWidth] = useAtom(sidebarWidthAtom);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  const startResizing = React.useCallback((mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback(
    (mouseMoveEvent) => {
      if (isResizing) {
        const newWidth =
          mouseMoveEvent.clientX -
          sidebarRef.current.getBoundingClientRect().left;
        if (newWidth < 220) {
          setSidebarWidth(220);
          return;
        }
        if (newWidth > 600) {
          setSidebarWidth(600);
          return;
        }
        setSidebarWidth(newWidth);
      }
    },
    [isResizing],
  );

  useEffect(() => {
    //https://codesandbox.io/p/sandbox/kz9de
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const location = useLocation();
  const isSettingsRoute = location.pathname.includes("/settings");
  const isSpaceRoute = location.pathname.includes("/s/");
  const isHomeRoute = location.pathname.includes("/home");
  const isSpacesRoute = location.pathname.endsWith("/spaces");
  const isPageRoute = location.pathname.includes("/p/");
  const hideSidebar = isHomeRoute || isSpacesRoute;
  const isCommentsOpen = isPageRoute && isAsideOpen && asideTab === "comments";
  const isTocOpen = isPageRoute && isAsideOpen && asideTab === "toc";

  return (
    <AppShell
      header={!isSpaceRoute ? { height: 45 } : undefined}
      navbar={
        !hideSidebar && {
          width: isSpaceRoute ? sidebarWidth : 300,
          breakpoint: "sm",
          collapsed: {
            mobile: !mobileOpened,
            desktop: !desktopOpened,
          },
        }
      }
      aside={
        isCommentsOpen
          ? {
              width: 320,
              breakpoint: "sm",
              collapsed: { mobile: false, desktop: false },
            }
          : undefined
      }
      padding={isSpaceRoute ? 0 : "md"}
    >
      {!isSpaceRoute && (
        <AppShell.Header px="md" className={classes.header}>
          <AppHeader />
        </AppShell.Header>
      )}
      {!hideSidebar && (
        <AppShell.Navbar
          className={classes.navbar}
          withBorder={false}
          ref={sidebarRef}
        >
          <div className={classes.resizeHandle} onMouseDown={startResizing} />
          {isSpaceRoute && <SpaceSidebar />}
          {isSettingsRoute && <SettingsSidebar />}
        </AppShell.Navbar>
      )}
      <AppShell.Main>
        {isSettingsRoute ? (
          <Container size={850}>{children}</Container>
        ) : (
          children
        )}
      </AppShell.Main>

      {isCommentsOpen && (
        <AppShell.Aside className={classes.aside} p={0} withBorder={false}>
          <Aside />
        </AppShell.Aside>
      )}

      <Transition
        mounted={isTocOpen}
        transition="fade-left"
        duration={160}
        timingFunction="ease"
      >
        {(styles) => (
          <aside
            className={classes.tocPanel}
            style={styles}
            aria-label="Table of contents"
          >
            <Aside />
          </aside>
        )}
      </Transition>
    </AppShell>
  );
}
