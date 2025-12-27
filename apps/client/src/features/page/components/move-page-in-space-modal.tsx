import { Modal, Button, Group, Text, Box, ScrollArea } from "@mantine/core";
import { useState, useMemo } from "react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { Tree, NodeRendererProps, TreeApi } from "react-arborist";
import { SpaceTreeNode } from "@/features/page/tree/types";
import { getDescendantIds, filterTreeNodes } from "@/features/page/tree/utils/tree-filter";
import { moveNodeInTree } from "@/features/page/tree/utils/utils";
import { movePage } from "@/features/page/services/page-service";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { useAtom } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom";
import { queryClient } from "@/main";
import { useQueryEmit } from "@/features/websocket/use-query-emit";
import clsx from "clsx";
import classes from "@/features/page/tree/styles/tree.module.css";
import { 
  IconChevronDown, 
  IconChevronRight, 
  IconPointFilled,
  IconFileDescription
} from "@tabler/icons-react";
import { ActionIcon, rem } from "@mantine/core";

interface MovePageInSpaceModalProps {
  pageId: string;
  spaceId: string;
  open: boolean;
  onClose: () => void;
}

export default function MovePageInSpaceModal({
  pageId,
  spaceId,
  open,
  onClose,
}: MovePageInSpaceModalProps) {
  const { t } = useTranslation();
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [treeData, setTreeData] = useAtom(treeDataAtom);
  const emit = useQueryEmit();
  const [isMoving, setIsMoving] = useState(false);

  // Filter tree data: exclude current node and its descendants
  const filteredTreeData = useMemo(() => {
    const descendantIds = getDescendantIds(pageId, treeData);
    return filterTreeNodes(
      treeData.filter((node) => node.spaceId === spaceId),
      descendantIds
    );
  }, [pageId, spaceId, treeData]);

  const handleMove = async () => {
    if (isMoving) return;

    console.log('[MoveInSpace] Starting move operation:', { pageId, targetParentId, spaceId });
    setIsMoving(true);
    try {
      // Find node in original tree data (not filtered) to get correct children
      const findNode = (nodes: SpaceTreeNode[], id: string): SpaceTreeNode | null => {
        for (const node of nodes) {
          if (node.id === id) return node;
          if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
          }
        }
        return null;
      };

      // Find the page being moved to get its current parent
      const movedNode = findNode(treeData, pageId);
      const currentParentId = movedNode?.parentPageId || null;
      console.log('[MoveInSpace] Current parent ID:', currentParentId);

      // Get target parent's children to calculate position
      let position: string;
      
      if (targetParentId) {
        // Find target parent node in original tree
        const targetNode = findNode(treeData, targetParentId);
        const children = targetNode?.children || [];
        
        // Generate position to append at the end
        const lastPosition = children.length > 0 
          ? children[children.length - 1].position 
          : null;
        position = generateJitteredKeyBetween(lastPosition, null);
      } else {
        // Moving to root - get root nodes for this space
        const rootNodes = treeData.filter((node) => node.spaceId === spaceId);
        const lastPosition = rootNodes.length > 0 
          ? rootNodes[rootNodes.length - 1].position 
          : null;
        position = generateJitteredKeyBetween(lastPosition, null);
      }

      console.log('[MoveInSpace] Calculated position:', position);

      // Call API to move page
      const movePayload = {
        pageId,
        parentPageId: targetParentId,
        position,
      };
      console.log('[MoveInSpace] Calling movePage API with:', movePayload);
      await movePage(movePayload);
      console.log('[MoveInSpace] movePage API call succeeded');

      // Update local tree data immediately (optimistic update after API success)
      console.log('[MoveInSpace] Updating local tree data');
      const updatedTree = moveNodeInTree(treeData, pageId, targetParentId, position);
      setTreeData(updatedTree);
      console.log('[MoveInSpace] Local tree data updated');

      // Emit WebSocket event for real-time collaboration
      setTimeout(() => {
        const wsPayload = {
          operation: "moveTreeNode" as const,
          spaceId,
          payload: { 
            id: pageId,
            parentId: targetParentId,
            index: 0, // Not used for append operation
            position 
          },
        };
        console.log('[MoveInSpace] Emitting WebSocket event:', wsPayload);
        emit(wsPayload);
      }, 50);

      // Refetch queries to refresh tree immediately
      console.log('[MoveInSpace] Refetching queries:', { 
        rootQuery: ["root-sidebar-pages", spaceId],
        currentParentQuery: currentParentId ? ["sidebar-pages", currentParentId] : null,
        targetParentQuery: targetParentId ? ["sidebar-pages", targetParentId] : null 
      });
      
      const queriesToRefetch = [
        queryClient.refetchQueries({
          queryKey: ["root-sidebar-pages", spaceId],
        }),
      ];
      
      // Refetch current parent's children query
      if (currentParentId) {
        queriesToRefetch.push(
          queryClient.refetchQueries({
            queryKey: ["sidebar-pages", currentParentId],
          })
        );
      }
      
      // Refetch target parent's children query
      if (targetParentId) {
        queriesToRefetch.push(
          queryClient.refetchQueries({
            queryKey: ["sidebar-pages", targetParentId],
          })
        );
      }
      
      await Promise.all(queriesToRefetch);
      
      console.log('[MoveInSpace] Query refetch complete');

      notifications.show({
        message: t("Page moved successfully"),
      });
      
      onClose();
      setTargetParentId(null);
    } catch (err) {
      notifications.show({
        message: err.response?.data?.message || t("An error occurred"),
        color: "red",
      });
      console.error(err);
    } finally {
      setIsMoving(false);
    }
  };

  const handleNodeClick = (nodeId: string) => {
    setTargetParentId(nodeId === targetParentId ? null : nodeId);
  };

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      size={600}
      padding="xl"
      yOffset="10vh"
      xOffset={0}
      onClick={(e) => e.stopPropagation()}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header py={0}>
          <Modal.Title fw={500}>{t("Move to page in space")}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Text mb="md" c="dimmed" size="sm">
            {t("Select a target page. The page will be moved as a child page at the end.")}
          </Text>

          <Box 
            style={{ 
              border: "1px solid var(--mantine-color-gray-3)",
              borderRadius: "4px",
              minHeight: "300px",
              maxHeight: "400px",
            }}
          >
            {filteredTreeData.length > 0 ? (
              <Tree
                data={filteredTreeData}
                width="100%"
                height={400}
                disableDrag
                disableDrop
                disableEdit
                indent={20}
              >
                {(props) => (
                  <MoveTargetNode
                    {...props}
                    selectedId={targetParentId}
                    onNodeClick={handleNodeClick}
                  />
                )}
              </Tree>
            ) : (
              <Box p="md" style={{ textAlign: "center" }}>
                <Text c="dimmed" size="sm">
                  {t("No available pages to move to")}
                </Text>
              </Box>
            )}
          </Box>

          <Group justify="space-between" mt="md">
            <Text size="sm" c="dimmed">
              {targetParentId 
                ? t("Selected target page") 
                : t("Move to root (no parent)")}
            </Text>
            <Group>
              <Button onClick={onClose} variant="default" disabled={isMoving}>
                {t("Cancel")}
              </Button>
              <Button onClick={handleMove} loading={isMoving}>
                {t("Move")}
              </Button>
            </Group>
          </Group>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

interface MoveTargetNodeProps extends NodeRendererProps<SpaceTreeNode> {
  selectedId: string | null;
  onNodeClick: (nodeId: string) => void;
}

function MoveTargetNode({ node, style, selectedId, onNodeClick, tree }: MoveTargetNodeProps) {
  const { t } = useTranslation();
  const isSelected = node.id === selectedId;

  return (
    <Box
      style={{
        ...style,
        cursor: "pointer",
        backgroundColor: isSelected 
          ? "var(--mantine-color-blue-1)" 
          : node.isSelected 
          ? "var(--mantine-color-gray-1)" 
          : "transparent",
        color: isSelected ? "var(--mantine-color-blue-9)" : "inherit",
        fontWeight: isSelected ? 500 : "normal",
      }}
      className={clsx(classes.node)}
      onClick={(e) => {
        e.stopPropagation();
        onNodeClick(node.id);
      }}
    >
      <ActionIcon
        size={20}
        variant="subtle"
        c={isSelected ? "blue" : "gray"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          node.toggle();
        }}
      >
        {node.isInternal ? (
          node.children && (node.children.length > 0 || node.data.hasChildren) ? (
            node.isOpen ? (
              <IconChevronDown stroke={2} size={18} />
            ) : (
              <IconChevronRight stroke={2} size={18} />
            )
          ) : (
            <IconPointFilled size={8} />
          )
        ) : null}
      </ActionIcon>

      <Box style={{ marginRight: "8px", marginLeft: "6px", display: "flex", alignItems: "center" }}>
        {node.data.icon ? (
          <span>{node.data.icon}</span>
        ) : (
          <IconFileDescription size={18} />
        )}
      </Box>

      <span className={classes.text}>{node.data.name || t("untitled")}</span>
    </Box>
  );
}
