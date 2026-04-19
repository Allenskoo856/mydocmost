import { useLocation, useParams } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query";
import { FullEditor } from "@/features/editor/full-editor";
import HistoryModal from "@/features/page-history/components/history-modal";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/features/page/components/header/page-header.tsx";
import { extractPageSlugId } from "@/lib";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import { useTranslation } from "react-i18next";
import React from "react";
import { markPerf, measurePerf } from "@/lib/perf.ts";

const MemoizedFullEditor = React.memo(FullEditor);
const MemoizedPageHeader = React.memo(PageHeader);
const MemoizedHistoryModal = React.memo(HistoryModal);

export default function Page() {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const location = useLocation();
  const pageId = extractPageSlugId(pageSlug);

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = usePageQuery({ pageId });
  const { data: space } = useGetSpaceBySlugQuery(page?.space?.slug);

  const spaceRules = space?.membership?.permissions;
  const spaceAbility = useSpaceAbility(spaceRules);

  React.useEffect(() => {
    markPerf(`page-route:${location.pathname}:start`, {
      pathname: location.pathname,
      pageId,
    });
  }, [location.pathname, pageId]);

  React.useEffect(() => {
    if (!page) return;

    const startMark = `page-route:${location.pathname}:start`;
    const endMark = `page-route:${location.pathname}:data-ready`;
    markPerf(endMark, { pathname: location.pathname, pageId: page.id });
    measurePerf("page-route-data", startMark, endMark, {
      pathname: location.pathname,
      pageId: page.id,
    });
  }, [location.pathname, page]);

  if (isLoading) {
    return <></>;
  }

  if (isError || !page) {
    if ([401, 403, 404].includes(error?.["status"])) {
      return <div>{t("Page not found")}</div>;
    }
    return <div>{t("Error fetching page data.")}</div>;
  }

  const canManagePage = space
    ? spaceAbility.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)
    : false;

  return (
    page && (
      <div>
        <Helmet>
          <title>{`${page?.icon || ""}  ${page?.title || t("untitled")}`}</title>
        </Helmet>

        <MemoizedPageHeader
          readOnly={!canManagePage}
        />

        <MemoizedFullEditor
          key={page.id}
          pageId={page.id}
          title={page.title}
          content={page.content}
          slugId={page.slugId}
          spaceSlug={page?.space?.slug}
          spaceId={page.spaceId}
          editable={canManagePage}
        />
        <MemoizedHistoryModal pageId={page.id} />
      </div>
    )
  );
}
