import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { aiPanelOpenAtom } from "@/features/ai/atoms/ai-atoms";
import { askAi, AskParams } from "@/features/ai/services/ai-service";
import { AiAskScope, AiCitation } from "@/features/ai/types";
import { usePageQuery } from "@/features/page/queries/page-query";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query";
import { extractPageSlugId } from "@/lib";
import { buildPageUrl } from "@/features/page/page.utils";
import { isAiEnabled } from "@/lib/config";

export default function AiAskPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opened, setOpened] = useAtom(aiPanelOpenAtom);
  const { pageSlug, spaceSlug } = useParams();
  const { data: page } = usePageQuery({
    pageId: pageSlug ? extractPageSlugId(pageSlug) : undefined,
  });
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);

  const pageId = page?.id;
  const spaceId = space?.id ?? page?.spaceId;

  const [scope, setScope] = useState<AiAskScope>("workspace");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<AiCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<null | (() => void)>(null);

  // Default to the most specific scope available when the panel opens.
  useEffect(() => {
    if (opened) {
      setScope(pageId ? "page" : spaceId ? "space" : "workspace");
    }
  }, [opened, pageId, spaceId]);

  useEffect(() => () => abortRef.current?.(), []);

  if (!isAiEnabled()) return null;

  const scopeOptions = [
    ...(pageId ? [{ label: t("This page"), value: "page" }] : []),
    ...(spaceId ? [{ label: t("This space"), value: "space" }] : []),
    { label: t("Workspace"), value: "workspace" },
  ];

  const handleAsk = () => {
    const q = question.trim();
    if (!q || loading) return;
    abortRef.current?.();
    setAnswer("");
    setCitations([]);
    setError(null);
    setLoading(true);

    const params: AskParams = { question: q };
    if (scope === "space" && spaceId) params.spaceId = spaceId;
    if (scope === "page" && pageId) params.pageId = pageId;

    abortRef.current = askAi(params, (event) => {
      if (event.type === "citations") setCitations(event.items);
      else if (event.type === "token") setAnswer((prev) => prev + event.value);
      else if (event.type === "done") setLoading(false);
      else if (event.type === "error") {
        setError(event.message);
        setLoading(false);
      }
    });
  };

  const handleStop = () => {
    abortRef.current?.();
    setLoading(false);
  };

  const openCitation = (citation: AiCitation) => {
    navigate(buildPageUrl(citation.spaceSlug, citation.slugId, citation.title));
    setOpened(false);
  };

  return (
    <Drawer
      opened={opened}
      onClose={() => setOpened(false)}
      position="right"
      size="lg"
      title={
        <Group gap="xs">
          <IconRobot size={20} />
          <Text fw={600}>{t("Ask AI")}</Text>
        </Group>
      }
    >
      <Stack gap="sm" h="100%">
        <SegmentedControl
          size="xs"
          value={scope}
          onChange={(v) => setScope(v as AiAskScope)}
          data={scopeOptions}
        />

        <Textarea
          placeholder={t("Ask a question about your documents...")}
          autosize
          minRows={2}
          maxRows={5}
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
        />

        <Group justify="flex-end">
          {loading ? (
            <Button variant="default" onClick={handleStop}>
              {t("Stop")}
            </Button>
          ) : (
            <Button onClick={handleAsk} disabled={!question.trim()}>
              {t("Ask")}
            </Button>
          )}
        </Group>

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        <ScrollArea style={{ flex: 1 }} type="auto">
          <Stack gap="md">
            {(answer || loading) && (
              <Box>
                <Text
                  size="sm"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {answer}
                  {loading && <Loader size="xs" ml={4} />}
                </Text>
              </Box>
            )}

            {citations.length > 0 && (
              <Stack gap="xs">
                <Text size="xs" c="dimmed" fw={600}>
                  {t("Sources")}
                </Text>
                {citations.map((citation) => (
                  <Card
                    key={citation.pageId}
                    withBorder
                    padding="xs"
                    radius="sm"
                  >
                    <Anchor
                      size="sm"
                      onClick={() => openCitation(citation)}
                      style={{ cursor: "pointer" }}
                    >
                      [{citation.n}] {citation.icon ? `${citation.icon} ` : ""}
                      {citation.title || t("Untitled")}
                    </Anchor>
                  </Card>
                ))}
              </Stack>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </Drawer>
  );
}
