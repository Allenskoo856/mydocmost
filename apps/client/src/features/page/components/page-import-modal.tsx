import {
  Modal,
  Button,
  SimpleGrid,
  Group,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconBrandNotion,
  IconCheck,
  IconFileCode,
  IconFileTypeZip,
  IconMarkdown,
  IconX,
} from "@tabler/icons-react";
import {
  importPage,
  importZip,
  getSidebarPages,
} from "@/features/page/services/page-service.ts";
import { notifications } from "@mantine/notifications";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { useAtom } from "jotai";
import { buildTree } from "@/features/page/tree/utils";
import { IPage } from "@/features/page/types/page.types.ts";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfluenceIcon } from "@/components/icons/confluence-icon.tsx";
import { getFileImportSizeLimit, isCloud } from "@/lib/config.ts";
import { formatBytes } from "@/lib";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getFileTaskById } from "@/features/file-task/services/file-task-service.ts";
import { queryClient } from "@/main.tsx";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";

interface PageImportModalProps {
  spaceId: string;
  targetParentId?: string;
  open: boolean;
  onClose: () => void;
}

export default function PageImportModal({
  spaceId,
  targetParentId,
  open,
  onClose,
}: PageImportModalProps) {
  const { t } = useTranslation();
  return (
    <>
      <Modal.Root
        opened={open}
        onClose={onClose}
        size={600}
        padding="xl"
        yOffset="10vh"
        xOffset={0}
        mah={400}
        withinPortal={true}
        trapFocus={false}
      >
        <Modal.Overlay />
        <Modal.Content style={{ overflow: "hidden" }}>
          <Modal.Header py={0}>
            <Modal.Title fw={500}>{t("Import pages")}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body>
            <ImportFormatSelection
              spaceId={spaceId}
              targetParentId={targetParentId}
              onClose={onClose}
            />
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}

interface ImportFormatSelection {
  spaceId: string;
  targetParentId?: string;
  onClose: () => void;
}
function ImportFormatSelection({
  spaceId,
  targetParentId,
  onClose,
}: ImportFormatSelection) {
  const { t } = useTranslation();
  const [treeData, setTreeData] = useAtom(treeDataAtom);
  const [workspace] = useAtom(workspaceAtom);
  const [fileTaskId, setFileTaskId] = useState<string | null>(null);
  // Store the targetParentId when zip upload starts, before modal closes
  const [savedTargetParentId, setSavedTargetParentId] = useState<string | null>(null);
  const emit = useQueryEmit();
  
  // Use ref to keep latest values for use in useEffect closure
  const treeDataRef = useRef(treeData);
  treeDataRef.current = treeData;

  // Use native input refs instead of FileButton refs
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const notionInputRef = useRef<HTMLInputElement>(null);
  const confluenceInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const canUseConfluence = isCloud() || workspace?.hasLicenseKey;

  const handleZipUpload = async (selectedFile: File, source: string) => {
    if (!selectedFile) {
      return;
    }

    // Save targetParentId before closing modal
    setSavedTargetParentId(targetParentId || null);

    try {
      onClose();

      notifications.show({
        id: "import",
        title: t("Uploading import file"),
        message: t("Please don't close this tab."),
        loading: true,
        withCloseButton: false,
        autoClose: false,
      });

      const importTask = await importZip(
        selectedFile,
        spaceId,
        source,
        targetParentId,
      );
      notifications.update({
        id: "import",
        title: t("Importing pages"),
        message: t(
          "Page import is in progress. You can check back later if this takes longer.",
        ),
        loading: true,
        withCloseButton: true,
        autoClose: false,
      });

      setFileTaskId(importTask.id);

      // Reset file input after successful upload
      if (source === "notion" && notionInputRef.current) {
        notionInputRef.current.value = "";
      } else if (source === "confluence" && confluenceInputRef.current) {
        confluenceInputRef.current.value = "";
      } else if (source === "generic" && zipInputRef.current) {
        zipInputRef.current.value = "";
      }
    } catch (err) {
      console.log("Failed to upload import file", err);
      notifications.update({
        id: "import",
        color: "red",
        title: t("Failed to upload import file"),
        message: err?.response.data.message,
        icon: <IconX size={18} />,
        loading: false,
        withCloseButton: true,
        autoClose: false,
      });
    }
  };

  useEffect(() => {
    if (!fileTaskId) return;

    const intervalId = setInterval(async () => {
      try {
        const fileTask = await getFileTaskById(fileTaskId);
        const status = fileTask.status;

        if (status === "success") {
          notifications.update({
            id: "import",
            color: "teal",
            title: t("Import complete"),
            message: t("Your pages were successfully imported."),
            icon: <IconCheck size={18} />,
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);

          // Update tree based on import target
          console.log('ZIP import success, savedTargetParentId:', savedTargetParentId);
          if (savedTargetParentId) {
            // Fetch the updated children for the parent page
            try {
              console.log('Fetching children for parent:', savedTargetParentId);
              const childrenResponse = await getSidebarPages({
                spaceId: fileTask.spaceId,
                pageId: savedTargetParentId,
              });
              console.log('Children response:', childrenResponse);
              
              if (childrenResponse?.items?.length > 0) {
                const newTreeNodes = buildTree(childrenResponse.items);
                console.log('New tree nodes:', newTreeNodes);
                
                // Helper function to update children for a specific parent
                const updateChildrenForParent = (
                  nodes: SpaceTreeNode[],
                  parentId: string,
                  newChildren: SpaceTreeNode[]
                ): SpaceTreeNode[] => {
                  return nodes.map((node) => {
                    if (node.id === parentId) {
                      return {
                        ...node,
                        hasChildren: true,
                        children: newChildren,
                      };
                    }
                    if (node.children && node.children.length > 0) {
                      return {
                        ...node,
                        children: updateChildrenForParent(node.children, parentId, newChildren),
                      };
                    }
                    return node;
                  });
                };

                const currentTree = treeDataRef.current;
                const updatedTree = updateChildrenForParent(currentTree, savedTargetParentId, newTreeNodes);
                setTreeData(updatedTree);
              }
            } catch (err) {
              console.error("Failed to fetch updated children:", err);
            }
          } else {
            // Importing to root - refetch root pages and update tree
            try {
              const rootResponse = await getSidebarPages({
                spaceId: fileTask.spaceId,
              });
              
              if (rootResponse?.items?.length > 0) {
                const newRootNodes = buildTree(rootResponse.items);
                const currentTree = treeDataRef.current;
                // Merge with existing tree, keeping existing node's children
                const mergedTree = newRootNodes.map((newNode) => {
                  const existingNode = currentTree.find((n) => n.id === newNode.id);
                  if (existingNode && existingNode.children) {
                    return { ...newNode, children: existingNode.children };
                  }
                  return newNode;
                });
                // Add any new nodes that weren't in previous tree
                const existingIds = new Set(currentTree.map((n) => n.id));
                const brandNewNodes = newRootNodes.filter((n) => !existingIds.has(n.id));
                setTreeData([...currentTree.filter((n) => newRootNodes.some((nn) => nn.id === n.id)), ...brandNewNodes]);
              }
            } catch (err) {
              console.error("Failed to fetch updated root pages:", err);
            }
          }
        }

        if (status === "failed") {
          notifications.update({
            id: "import",
            color: "red",
            title: t("Page import failed"),
            message: t(
              "Something went wrong while importing pages: {{reason}}.",
              {
                reason: fileTask.errorMessage,
              },
            ),
            icon: <IconX size={18} />,
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);
          console.error(fileTask.errorMessage);
        }
      } catch (err) {
        notifications.update({
          id: "import",
          color: "red",
          title: t("Import failed"),
          message: t(
            "Something went wrong while importing pages: {{reason}}.",
            {
              reason: err.response?.data.message,
            },
          ),
          icon: <IconX size={18} />,
          loading: false,
          withCloseButton: true,
          autoClose: false,
        });
        clearInterval(intervalId);
        setFileTaskId(null);
        console.error("Failed to fetch import status", err);
      }
    }, 3000);
  }, [fileTaskId, savedTargetParentId]);

  const handleFileUpload = async (selectedFiles: File[]) => {
    if (!selectedFiles) {
      return;
    }

    onClose();

    const alert = notifications.show({
      title: t("Importing pages"),
      message: t("Page import is in progress. Please do not close this tab."),
      loading: true,
      autoClose: false,
    });

    const pages: IPage[] = [];
    let pageCount = 0;

    for (const file of selectedFiles) {
      try {
        const page = await importPage(file, spaceId, targetParentId);
        pages.push(page);
        pageCount += 1;
      } catch (err) {
        console.log("Failed to import page", err);
      }
    }

    if (pages?.length > 0 && pageCount > 0) {
      // Reset file inputs after successful upload
      if (markdownInputRef.current) markdownInputRef.current.value = "";
      if (htmlInputRef.current) htmlInputRef.current.value = "";

      // Build tree nodes from imported pages
      const newTreeNodes = buildTree(pages);

      if (targetParentId) {
        // If importing into a specific page, append new nodes to existing children
        // We need to find the parent node and append to its children array
        const addChildrenToParent = (
          nodes: typeof treeData,
          parentId: string,
          newChildren: typeof treeData
        ): typeof treeData => {
          return nodes.map((node) => {
            if (node.id === parentId) {
              // Found the parent, append new children to existing ones
              const existingChildren = node.children || [];
              return {
                ...node,
                hasChildren: true,
                children: [...existingChildren, ...newChildren],
              };
            }
            if (node.children && node.children.length > 0) {
              return {
                ...node,
                children: addChildrenToParent(node.children, parentId, newChildren),
              };
            }
            return node;
          });
        };

        const updatedTree = addChildrenToParent(treeData, targetParentId, newTreeNodes);
        setTreeData(updatedTree);
      } else {
        // If importing to root, add to root level
        const fullTree = treeData.concat(newTreeNodes);
        if (newTreeNodes?.length && fullTree?.length > 0) {
          setTreeData(fullTree);
        }
      }

      const pageCountText =
        pageCount === 1 ? `1 ${t("page")}` : `${pageCount} ${t("pages")}`;

      notifications.update({
        id: alert,
        color: "teal",
        title: `${t("Successfully imported")} ${pageCountText}`,
        message: t("Your import is complete."),
        icon: <IconCheck size={18} />,
        loading: false,
        autoClose: 5000,
      });
    } else {
      notifications.update({
        id: alert,
        color: "red",
        title: t("Failed to import pages"),
        message: t("Unable to import pages. Please try again."),
        icon: <IconX size={18} />,
        loading: false,
        autoClose: 5000,
      });
    }
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={markdownInputRef}
        style={{ display: 'none' }}
        accept=".md,.markdown"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(Array.from(e.target.files));
          }
        }}
      />
      <input
        type="file"
        ref={htmlInputRef}
        style={{ display: 'none' }}
        accept=".html,.htm"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(Array.from(e.target.files));
          }
        }}
      />
      <input
        type="file"
        ref={notionInputRef}
        style={{ display: 'none' }}
        accept=".zip"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleZipUpload(e.target.files[0], "notion");
          }
        }}
      />
      <input
        type="file"
        ref={confluenceInputRef}
        style={{ display: 'none' }}
        accept=".zip"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleZipUpload(e.target.files[0], "confluence");
          }
        }}
      />
      <input
        type="file"
        ref={zipInputRef}
        style={{ display: 'none' }}
        accept=".zip"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleZipUpload(e.target.files[0], "generic");
          }
        }}
      />

      <SimpleGrid cols={2}>
        <Button
          justify="start"
          variant="default"
          leftSection={<IconMarkdown size={18} />}
          onClick={() => markdownInputRef.current?.click()}
        >
          Markdown
        </Button>

        <Button
          justify="start"
          variant="default"
          leftSection={<IconFileCode size={18} />}
          onClick={() => htmlInputRef.current?.click()}
        >
          HTML
        </Button>

        <Button
          justify="start"
          variant="default"
          leftSection={<IconBrandNotion size={18} />}
          onClick={() => notionInputRef.current?.click()}
        >
          Notion
        </Button>

        <Tooltip
          label={t("Available in enterprise edition")}
          disabled={canUseConfluence}
          withinPortal
        >
          <div>
            <Button
              disabled={!canUseConfluence}
              justify="start"
              variant="default"
              leftSection={<ConfluenceIcon size={18} />}
              onClick={() => canUseConfluence && confluenceInputRef.current?.click()}
            >
              Confluence
            </Button>
          </div>
        </Tooltip>
      </SimpleGrid>

      <Group justify="center" gap="xl" mih={150}>
        <div>
          <Text ta="center" size="lg" inline>
            {t("Import zip file")}
          </Text>
          <Text ta="center" size="sm" c="dimmed" inline py="sm">
            {t(
              `Upload zip file containing Markdown and HTML files. Max: {{sizeLimit}}`,
              {
                sizeLimit: formatBytes(getFileImportSizeLimit()),
              },
            )}
          </Text>
          <Group justify="center">
            <Button
              justify="center"
              leftSection={<IconFileTypeZip size={18} />}
              onClick={() => zipInputRef.current?.click()}
            >
              {t("Upload file")}
            </Button>
          </Group>
        </div>
      </Group>
    </>
  );
}
