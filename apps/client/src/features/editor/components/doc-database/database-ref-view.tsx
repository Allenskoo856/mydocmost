import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as Y from "yjs";
import {
  ActionIcon,
  Badge,
  Checkbox,
  Group,
  Loader,
  Menu,
  MultiSelect,
  Popover,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Switch,
  Button,
  Tabs,
  rem,
  Modal,
  Box,
  ScrollArea,
} from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconTrash,
  IconCheck,
  IconArrowUp,
  IconRowInsertBottom,
  IconAdjustments,
  IconArrowLeft,
  IconArrowRight,
  IconEyeOff,
  IconClearAll,
  IconTextWrap,
  IconAlignLeft,
  IconHash,
  IconCircleDot,
  IconList,
  IconCalendar,
  IconPaperclip,
  IconLink,
  IconSquareCheck,
  IconListCheck,
  IconClock,
  IconCalendarPlus,
  IconArrowsLeftRight,
  IconTableColumn,
  IconSparkles,
  IconSelect,
  IconDatabase,
  IconDots,
  IconX,
  IconUpload,
  IconEraser,
  IconFileDescription,
} from "@tabler/icons-react";
import { v7 as uuid7 } from "uuid";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Tree, NodeRendererProps, NodeApi } from "react-arborist";
import { useAtomValue } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom";
import { SpaceTreeNode } from "@/features/page/tree/types";
import { buildPageUrl } from "@/features/page/page.utils";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";
import { usePageQuery } from "@/features/page/queries/page-query";
import { getAllSidebarPages, getSidebarPages } from "@/features/page/services/page-service";
import { buildTree, buildTreeWithChildren, appendNodeChildren } from "@/features/page/tree/utils/utils";
import { useCollabToken } from "@/features/auth/queries/auth-query";
import {
  getDocDatabaseInfo,
  updateDocDatabase,
  type DocDatabaseInfoResponse,
} from "@/features/editor/services/doc-database-service";
import { uploadFile } from "@/features/page/services/page-service";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FieldType,
  FIELD_TYPE_OPTIONS,
  GridSize,
  OPTION_COLORS,
  SelectOption,
  getRandomOptionColor,
} from "./constants";
import styles from "./database-table.module.css";

// ============================================================
// Types
// ============================================================
interface ColumnData {
  id: string;
  name: string;
  type: FieldType;
  width: number;
  options?: SelectOption[];
  ymap: Y.Map<any>;
}

interface RowData {
  id: string;
  cells: Y.Map<any>;
  createdAt: number;
  updatedAt: number;
  ymap: Y.Map<any>;
}

// ============================================================
// Utility Functions
// ============================================================
function ensureInitialized(doc: Y.Doc) {
  const columns = doc.getArray<Y.Map<any>>("columns");
  const rows = doc.getArray<Y.Map<any>>("rows");

  if (columns.length === 0) {
    doc.transact(() => {
      const nameCol = new Y.Map<any>();
      nameCol.set("id", uuid7());
      nameCol.set("name", "名称");
      nameCol.set("type", "text");
      nameCol.set("width", GridSize.defaultColumnWidth);
      columns.push([nameCol]);
    });
  }

  if (rows.length === 0) {
    doc.transact(() => {
      const row = new Y.Map<any>();
      row.set("id", uuid7());
      row.set("cells", new Y.Map());
      row.set("createdAt", Date.now());
      row.set("updatedAt", Date.now());
      rows.push([row]);
    });
  }
}

function readColumns(doc: Y.Doc): ColumnData[] {
  const columns = doc.getArray<Y.Map<any>>("columns");
  return columns.toArray().map((c) => ({
    id: String(c.get("id")),
    name: String(c.get("name") ?? ""),
    type: (c.get("type") as FieldType) ?? "text",
    width: Number(c.get("width")) || GridSize.defaultColumnWidth,
    options: c.get("options") as SelectOption[] | undefined,
    hidden: Boolean(c.get("hidden")),
    ymap: c,
  })).filter(c => !c.hidden);
}

function readRows(doc: Y.Doc): RowData[] {
  const rows = doc.getArray<Y.Map<any>>("rows");
  return rows.toArray().map((r) => {
    const cells = r.get("cells") as Y.Map<any> | undefined;
    return {
      id: String(r.get("id")),
      cells: cells ?? new Y.Map<any>(),
      createdAt: Number(r.get("createdAt")) || 0,
      updatedAt: Number(r.get("updatedAt")) || 0,
      ymap: r,
    };
  });
}

// ============================================================
// Cell Components
// ============================================================
interface CellProps {
  value: any;
  onChange: (value: any) => void;
  editable: boolean;
  column: ColumnData;
  onUpdateOptions?: (options: SelectOption[]) => void;
  row?: RowData;
  pageId?: string;
}

function UrlCell({ value, onChange, editable }: CellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  if (!isEditing) {
    return (
      <div
        onClick={() => editable && setIsEditing(true)}
        style={{
          cursor: editable ? "text" : "default",
          minHeight: 24,
          whiteSpace: "normal",
          wordBreak: "break-all",
          display: "flex",
          alignItems: "flex-start",
          gap: 4,
        }}
      >
        {localValue ? (
          <>
            <IconLink size={14} style={{ flexShrink: 0, opacity: 0.5, marginTop: 3 }} />
            <a 
              href={localValue} 
              target="_blank" 
              rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()}
              style={{ color: "var(--mantine-color-blue-6)", textDecoration: "underline" }}
            >
              {localValue}
            </a>
          </>
        ) : (
          editable && <span className={styles.selectPlaceholder}>点击添加链接</span>
        )}
      </div>
    );
  }

  return (
    <TextInput
      value={localValue}
      onChange={(e) => setLocalValue(e.currentTarget.value)}
      onBlur={() => {
        onChange(localValue);
        setIsEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onChange(localValue);
          setIsEditing(false);
        }
        if (e.key === "Escape") {
          setLocalValue(value ?? "");
          setIsEditing(false);
        }
      }}
      autoFocus
      size="xs"
      variant="unstyled"
      styles={{ input: { padding: 0, height: 24, minHeight: 24 } }}
      placeholder="输入链接..."
    />
  );
}

interface FileValue {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

function FileCell({ value, onChange, editable, pageId }: CellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("upload");
  const [linkInput, setLinkInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const files: FileValue[] = useMemo(() => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    } catch {
      return [{ name: value, url: value }];
    }
  }, [value]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log("[FileCell] handleUpload triggered", { file, pageId });
    
    if (!file) return;
    
    if (!pageId) {
      console.error("[FileCell] Missing pageId, cannot upload");
      return;
    }

    setIsUploading(true);
    try {
      const attachment = await uploadFile(file, pageId);
      console.log("[FileCell] Upload success", attachment);
      const url = `/api/files/${attachment.id}/${attachment.fileName}`;
      const newFile: FileValue = {
        name: file.name,
        url: url,
        size: file.size,
        type: file.type
      };
      const newFiles = [...files, newFile];
      onChange(JSON.stringify(newFiles));
      setIsEditing(false);
    } catch (error) {
      console.error("[FileCell] Upload failed", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLinkSubmit = () => {
    if (!linkInput) return;
    const newFile: FileValue = {
      name: linkInput,
      url: linkInput
    };
    const newFiles = [...files, newFile];
    onChange(JSON.stringify(newFiles));
    setLinkInput("");
    setIsEditing(false);
  };

  const removeFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFiles = files.filter((_, i) => i !== index);
    onChange(newFiles.length ? JSON.stringify(newFiles) : "");
  };

  return (
    <Popover
      opened={isEditing}
      onChange={setIsEditing}
      position="bottom-start"
      withinPortal
      width={300}
      trapFocus
    >
      <Popover.Target>
        <div
          onClick={() => editable && setIsEditing(true)}
          style={{
            cursor: editable ? "pointer" : "default",
            minHeight: 24,
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            alignItems: "center",
          }}
        >
          {files.length > 0 ? (
            files.map((file, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 6px",
                  borderRadius: 4,
                  backgroundColor: "var(--mantine-color-gray-1)",
                  fontSize: 12,
                  maxWidth: "100%",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(file.url, "_blank");
                }}
              >
                <IconPaperclip size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 120,
                  }}
                >
                  {file.name}
                </span>
                {editable && (
                  <ActionIcon
                    size="xs"
                    variant="transparent"
                    color="gray"
                    onClick={(e) => removeFile(index, e)}
                  >
                    <IconX size={10} />
                  </ActionIcon>
                )}
              </div>
            ))
          ) : (
            editable && <span className={styles.selectPlaceholder}>点击添加文件</span>
          )}
        </div>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List grow>
            <Tabs.Tab value="upload">上传</Tabs.Tab>
            <Tabs.Tab value="embed">嵌入链接</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="upload" pt="xs">
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "1px dashed var(--mantine-color-gray-4)",
                borderRadius: 4,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                backgroundColor: "var(--mantine-color-gray-0)",
                minHeight: 100,
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleUpload}
              />
              {isUploading ? (
                <Loader size="sm" />
              ) : (
                <>
                  <IconUpload size={24} style={{ color: "var(--mantine-color-gray-5)", marginBottom: 8 }} />
                  <Text size="sm" c="dimmed">点击上传文件</Text>
                </>
              )}
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="embed" pt="xs">
            <Stack gap="xs">
              <TextInput
                placeholder="输入链接..."
                value={linkInput}
                onChange={(e) => setLinkInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLinkSubmit();
                }}
                autoFocus
              />
              <Button fullWidth size="xs" onClick={handleLinkSubmit} disabled={!linkInput}>
                嵌入链接
              </Button>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Popover.Dropdown>
    </Popover>
  );
}

interface PageValue {
  id: string;
  slugId: string;
  title: string;
  icon?: string;
  spaceId?: string;
}

function PagePicker({ onSelect, pageId }: { onSelect: (node: SpaceTreeNode) => void; pageId?: string }) {
  const globalTreeData = useAtomValue(treeDataAtom);
  const [searchTerm, setSearchTerm] = useState("");
  const [localTreeData, setLocalTreeData] = useState<SpaceTreeNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());

  // Get current page to filter by spaceId
  const { data: page } = usePageQuery({ pageId });
  const spaceId = page?.spaceId;

  // Initialize local tree from global tree
  useEffect(() => {
    if (!spaceId) return;
    const filtered = globalTreeData.filter((node) => node.spaceId === spaceId);
    setLocalTreeData(filtered);
  }, [spaceId, globalTreeData]);

  // Handle loading children when node is toggled
  const handleToggle = useCallback(async (node: NodeApi<SpaceTreeNode>) => {
    // Only load if node is being opened and doesn't have children yet
    if (!node.isOpen) {
      return; // Node is being closed, skip
    }

    // If already has children loaded, skip
    if (node.children && node.children.length > 0) {
      return;
    }

    // If doesn't have children flag, skip
    if (!node.data.hasChildren) {
      return;
    }

    // If already loading, skip
    if (loadingChildren.has(node.id)) {
      return;
    }

    // Start loading
    setLoadingChildren(prev => new Set(prev).add(node.id));
    
    try {
      console.log("[PagePicker] Loading children for node:", node.id);
      const params = {
        pageId: node.id,
        spaceId: node.data.spaceId,
      };

      const result = await getSidebarPages(params);
      const children = buildTree(result.items);
      
      console.log("[PagePicker] Loaded children:", children.length);

      // Update local tree with new children
      setLocalTreeData(prev => {
        const updated = appendNodeChildren(prev, node.id, children);
        console.log("[PagePicker] Updated tree:", updated);
        return updated;
      });
    } catch (error) {
      console.error("[PagePicker] Error loading children:", error);
    } finally {
      setLoadingChildren(prev => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
    }
  }, [loadingChildren, spaceId]);

  // Simple filter for search
  const searchFilteredData = useMemo(() => {
    if (!searchTerm) return localTreeData;
    const lowerTerm = searchTerm.toLowerCase();
    
    // Helper to filter tree
    const filterNodes = (nodes: SpaceTreeNode[]): SpaceTreeNode[] => {
      return nodes.reduce((acc, node) => {
        const matches = node.name.toLowerCase().includes(lowerTerm);
        const children = node.children ? filterNodes(node.children) : [];
        
        if (matches || children.length > 0) {
          acc.push({
            ...node,
            children: children.length > 0 ? children : node.children
          });
        }
        return acc;
      }, [] as SpaceTreeNode[]);
    };

    return filterNodes(localTreeData);
  }, [localTreeData, searchTerm]);

  console.log("[PagePicker] Global tree data:", globalTreeData.length, "items");
  console.log("[PagePicker] Local tree data:", localTreeData.length, "items");
  if (localTreeData[0]) {
    console.log("[PagePicker] Sample tree node:", localTreeData[0]);
    console.log("[PagePicker] Sample node has children:", localTreeData[0].children);
    console.log("[PagePicker] Sample node hasChildren flag:", localTreeData[0].hasChildren);
  }

  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      <TextInput 
        placeholder="搜索页面..." 
        size="sm" 
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.currentTarget.value)}
      />
      {localTreeData.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, minHeight: 300 }}>
          <Text size="sm" c="dimmed">暂无页面数据</Text>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "hidden", minHeight: 350 }}>
          <Tree
            data={searchFilteredData}
            width="100%"
            height={350}
            indent={20}
            rowHeight={32}
            paddingTop={8}
            paddingBottom={8}
            disableDrag
            disableDrop
            disableEdit
          >
            {(props: NodeRendererProps<SpaceTreeNode>) => (
              <div
                style={props.style}
                onClick={() => onSelect(props.node.data)}
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6, 
                    paddingLeft: props.node.level * 20 + 8,
                    paddingRight: 12,
                    height: '100%',
                    cursor: 'pointer',
                    backgroundColor: props.node.isSelected ? 'var(--mantine-color-blue-1)' : 'transparent',
                    borderRadius: 4
                  }}
                  className={styles.treeNodeHover}
                >
                  <ActionIcon
                    size={20}
                    variant="subtle"
                    c="gray"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const willOpen = !props.node.isOpen;
                      props.node.toggle();
                      if (willOpen) {
                        // Use setTimeout to ensure toggle completes first
                        setTimeout(() => handleToggle(props.node), 0);
                      }
                    }}
                  >
                    {loadingChildren.has(props.node.id) ? (
                      <Loader size={12} />
                    ) : props.node.isInternal ? (
                      props.node.children && (props.node.children.length > 0 || props.node.data.hasChildren) ? (
                        props.node.isOpen ? (
                          <IconChevronDown stroke={2} size={16} />
                        ) : (
                          <IconChevronRight stroke={2} size={16} />
                        )
                      ) : (
                        <IconCircleDot size={8} />
                      )
                    ) : null}
                  </ActionIcon>
                  <Box style={{ marginLeft: "4px", display: "flex", alignItems: "center" }}>
                    {props.node.data.icon ? (
                      <span style={{ fontSize: 16 }}>{props.node.data.icon}</span>
                    ) : (
                      <IconFileDescription size={16} />
                    )}
                  </Box>
                  <span style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: 4 }}>
                    {props.node.data.name}
                  </span>
                </div>
              </div>
            )}
          </Tree>
        </div>
      )}
    </Stack>
  );
}

function PageCell({ value, onChange, editable, pageId }: CellProps) {
  const navigate = useNavigate();
  const { spaceSlug } = useParams();
  const [isEditing, setIsEditing] = useState(false);

  const pageValue: PageValue | null = useMemo(() => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }, [value]);

  const handleSelect = (node: SpaceTreeNode) => {
    console.log('[PageCell] Selected node:', node);
    const newValue: PageValue = {
      id: node.id,
      slugId: node.slugId,
      title: node.name,
      icon: node.icon,
      spaceId: node.spaceId
    };
    onChange(JSON.stringify(newValue));
    setIsEditing(false);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pageValue && pageValue.slugId) {
      console.log('[PageCell] Navigating to page:', pageValue);
      const url = buildPageUrl(spaceSlug, pageValue.slugId, pageValue.title);
      console.log('[PageCell] Navigation URL:', url);
      navigate(url);
    }
  };

  return (
    <>
      <div
        onClick={() => editable && setIsEditing(true)}
        style={{
          cursor: editable ? "pointer" : "default",
          minHeight: 24,
          display: "flex",
          alignItems: "center",
          gap: 4,
          width: "100%"
        }}
      >
        {pageValue ? (
          <div 
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 4,
              padding: "2px 6px",
              borderRadius: 4,
              backgroundColor: "var(--mantine-color-gray-1)",
              maxWidth: "100%"
            }}
          >
            <span style={{ fontSize: 14 }}>{pageValue.icon || <IconFileDescription size={14} />}</span>
            <span 
              onClick={handleNavigate}
              style={{ 
                fontSize: 13, 
                cursor: "pointer",
                textDecoration: "underline",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 150
              }}
            >
              {pageValue.title}
            </span>
            {editable && (
              <ActionIcon
                size="xs"
                variant="transparent"
                color="gray"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              >
                <IconX size={10} />
              </ActionIcon>
            )}
          </div>
        ) : (
          editable && <span className={styles.selectPlaceholder}>选择页面...</span>
        )}
      </div>

      <Modal.Root
        opened={isEditing}
        onClose={() => setIsEditing(false)}
        size={600}
        padding="xl"
        yOffset="10vh"
        xOffset={0}
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header py={0}>
            <Modal.Title fw={500}>选择页面</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body>
            <Text mb="md" c="dimmed" size="sm">
              选择一个页面进行链接
            </Text>

            <Box 
              style={{ 
                border: "1px solid var(--mantine-color-gray-3)",
                borderRadius: "4px",
                minHeight: "400px",
                maxHeight: "500px",
              }}
            >
              <PagePicker onSelect={handleSelect} pageId={pageId} />
            </Box>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}

function TextCell({ value, onChange, editable }: CellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  if (!isEditing) {
    return (
      <div
        onClick={() => editable && setIsEditing(true)}
        style={{
          cursor: editable ? "text" : "default",
          minHeight: 24,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {localValue || (editable && <span className={styles.selectPlaceholder}>输入文本...</span>)}
      </div>
    );
  }

  return (
    <Textarea
      value={localValue}
      onChange={(e) => setLocalValue(e.currentTarget.value)}
      onBlur={() => {
        onChange(localValue);
        setIsEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setLocalValue(value ?? "");
          setIsEditing(false);
        }
      }}
      autoFocus
      autosize
      minRows={1}
      maxRows={6}
      styles={{
        input: {
          padding: "4px 8px",
        },
      }}
    />
  );
}

function NumberCell({ value, onChange, editable }: CellProps) {
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  return (
    <input
      type="number"
      className={`${styles.cellInput} ${styles.numberInput}`}
      value={localValue}
      onChange={(e) => setLocalValue(e.currentTarget.value)}
      onBlur={() => onChange(localValue)}
      disabled={!editable}
    />
  );
}

function DateCell({ value, onChange, editable }: CellProps) {
  const [opened, setOpened] = useState(false);
  
  // Parse value
  const dateValue = useMemo(() => {
    if (!value) return null;
    if (typeof value === 'string' && value.length === 10) {
       // YYYY-MM-DD -> Local Date
       const [y, m, d] = value.split('-').map(Number);
       return new Date(y, m - 1, d);
    }
    return new Date(value);
  }, [value]);

  const hasTime = useMemo(() => {
    if (!value) return false;
    return typeof value === 'string' && value.length > 10;
  }, [value]);

  // Local state for editing
  const [tempDate, setTempDate] = useState<Date | null>(dateValue);
  const [includeTime, setIncludeTime] = useState(hasTime);
  const [timeStr, setTimeStr] = useState("");

  // Sync local state when opening
  useEffect(() => {
    if (opened) {
      setTempDate(dateValue);
      setIncludeTime(hasTime);
      if (dateValue && hasTime) {
        const h = String(dateValue.getHours()).padStart(2, '0');
        const m = String(dateValue.getMinutes()).padStart(2, '0');
        setTimeStr(`${h}:${m}`);
      } else {
        setTimeStr("00:00");
      }
    }
  }, [opened, dateValue, hasTime]);

  const handleSave = (d: Date | null, withTime: boolean) => {
    if (!d) {
      onChange(null);
      return;
    }
    
    if (!withTime) {
      // Save as YYYY-MM-DD
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      onChange(`${year}-${month}-${day}`);
    } else {
      // Save as ISO string
      onChange(d.toISOString());
    }
  };

  const onDateSelect = (d: Date | null) => {
    if (!d) return;
    
    if (!tempDate) {
      const newDate = new Date(d);
      if (includeTime) {
         // Use current timeStr if valid
         const [h, m] = timeStr.split(':').map(Number);
         if (!isNaN(h) && !isNaN(m)) {
           newDate.setHours(h, m);
         } else {
           newDate.setHours(0, 0, 0, 0);
         }
      }
      setTempDate(newDate);
      handleSave(newDate, includeTime);
    } else {
      // Preserve time from tempDate
      const newDate = new Date(d);
      newDate.setHours(tempDate.getHours(), tempDate.getMinutes(), tempDate.getSeconds(), tempDate.getMilliseconds());
      setTempDate(newDate);
      handleSave(newDate, includeTime);
    }
  };

  const onTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimeStr(e.currentTarget.value);
  };

  const onTimeBlur = () => {
    if (!timeStr || !tempDate) return;
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
       const newDate = new Date(tempDate);
       newDate.setHours(h, m);
       setTempDate(newDate);
       handleSave(newDate, true);
    }
  };

  const onTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const toggleIncludeTime = (checked: boolean) => {
    setIncludeTime(checked);
    if (tempDate) {
      handleSave(tempDate, checked);
    }
  };

  const handleClear = () => {
    setTempDate(null);
    onChange(null);
    setOpened(false);
  };

  // Format for display
  const displayValue = useMemo(() => {
    if (!dateValue) return "";
    const dateStr = dateValue.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (hasTime) {
      const timeStr = dateValue.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${dateStr} ${timeStr}`;
    }
    return dateStr;
  }, [dateValue, hasTime]);

  // Format for input display in popover
  const inputDisplayValue = useMemo(() => {
    if (!tempDate) return "";
    const dateStr = tempDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (includeTime) {
      const timeStr = tempDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${dateStr} ${timeStr}`;
    }
    return dateStr;
  }, [tempDate, includeTime]);

  if (!editable) {
    return (
      <div 
        style={{
          minHeight: 24,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "flex",
          alignItems: "center",
        }}
      >
        {displayValue}
      </div>
    );
  }

  return (
    <Popover 
      opened={opened} 
      onChange={setOpened} 
      position="bottom-start" 
      withinPortal
      trapFocus
    >
      <Popover.Target>
        <div
          onClick={() => setOpened(true)}
          style={{ 
            cursor: "pointer", 
            minHeight: 24, 
            display: "flex", 
            alignItems: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {displayValue || <span className={styles.selectPlaceholder}>选择日期...</span>}
        </div>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack gap="sm">
          {/* Input Display */}
          <div 
            style={{
              border: "1px solid var(--mantine-color-blue-5)",
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 14,
              fontWeight: 500,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              minWidth: 240
            }}
          >
            <span>{inputDisplayValue || "Empty"}</span>
            {tempDate && (
               <IconX 
                 size={14} 
                 style={{ cursor: "pointer", opacity: 0.5 }} 
                 onClick={(e) => {
                   e.stopPropagation();
                   handleClear();
                 }}
               />
            )}
          </div>

          {/* Calendar */}
          <DatePicker
            value={tempDate}
            onChange={onDateSelect}
            size="sm"
            styles={{
              calendarHeader: { maxWidth: "100%" }
            }}
          />

          {/* Options */}
          <Stack gap="xs">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text size="sm">包含时间</Text>
              <Switch 
                checked={includeTime} 
                onChange={(e) => toggleIncludeTime(e.currentTarget.checked)} 
                size="sm"
              />
            </div>
            
            {includeTime && (
              <TimeInput
                value={timeStr}
                onChange={onTimeChange}
                onBlur={onTimeBlur}
                onKeyDown={onTimeKeyDown}
                size="sm"
              />
            )}
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function CheckboxCell({ value, onChange, editable }: CellProps) {
  return (
    <div className={styles.checkboxCell}>
      <Checkbox
        checked={!!value}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={!editable}
      />
    </div>
  );
}

// ============================================================
// Options Manager (可复用的选项管理组件)
// ============================================================
interface OptionsManagerProps {
  options: SelectOption[];
  onUpdateOptions: (options: SelectOption[]) => void;
  showAddButton?: boolean;
}

function OptionsManager({ options, onUpdateOptions, showAddButton = true }: OptionsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = (option: SelectOption) => {
    setEditingId(option.id);
    setEditingValue(option.label);
  };

  const handleSaveEdit = () => {
    if (editingId && editingValue.trim()) {
      const newOptions = options.map((o) =>
        o.id === editingId ? { ...o, label: editingValue.trim() } : o
      );
      onUpdateOptions(newOptions);
    }
    setEditingId(null);
    setEditingValue("");
  };

  const handleUpdateColor = (optionId: string, color: string) => {
    const newOptions = options.map((o) =>
      o.id === optionId ? { ...o, color } : o
    );
    onUpdateOptions(newOptions);
  };

  const handleDelete = (optionId: string) => {
    const newOptions = options.filter((o) => o.id !== optionId);
    onUpdateOptions(newOptions);
  };

  const handleAddNew = () => {
    if (newOptionLabel.trim()) {
      const newOption: SelectOption = {
        id: uuid7(),
        label: newOptionLabel.trim(),
        color: getRandomOptionColor(),
      };
      onUpdateOptions([...options, newOption]);
      setNewOptionLabel("");
      setIsAddingNew(false);
    }
  };

  const handleCancelAdd = () => {
    setNewOptionLabel("");
    setIsAddingNew(false);
  };

  return (
    <Stack gap={4}>
      {options.map((opt) => (
        <div key={opt.id} className={styles.optionEditRow}>
          {editingId === opt.id ? (
            <>
              <Popover position="bottom-start" withinPortal closeOnClickOutside={false}>
                <Popover.Target>
                  <span
                    className={styles.optionColor}
                    style={{ backgroundColor: opt.color, cursor: "pointer" }}
                  />
                </Popover.Target>
                <Popover.Dropdown p="xs">
                  <div className={styles.colorPicker}>
                    {OPTION_COLORS.map((color) => (
                      <span
                        key={color}
                        className={styles.colorSwatch}
                        style={{ backgroundColor: color }}
                        onClick={() => handleUpdateColor(opt.id, color)}
                      />
                    ))}
                  </div>
                </Popover.Dropdown>
              </Popover>
              <TextInput
                ref={inputRef}
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                size="xs"
                className={styles.optionEditInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditingValue("");
                  }
                }}
                autoFocus
              />
              <ActionIcon
                size="xs"
                variant="subtle"
                color="green"
                onClick={handleSaveEdit}
              >
                <IconCheck size={12} />
              </ActionIcon>
            </>
          ) : (
            <>
              <Popover position="bottom-start" withinPortal closeOnClickOutside={false}>
                <Popover.Target>
                  <span
                    className={styles.optionColor}
                    style={{ backgroundColor: opt.color, cursor: "pointer" }}
                  />
                </Popover.Target>
                <Popover.Dropdown p="xs">
                  <div className={styles.colorPicker}>
                    {OPTION_COLORS.map((color) => (
                      <span
                        key={color}
                        className={styles.colorSwatch}
                        style={{ backgroundColor: color }}
                        onClick={() => handleUpdateColor(opt.id, color)}
                      />
                    ))}
                  </div>
                </Popover.Dropdown>
              </Popover>
              <span className={styles.optionLabel} onClick={() => handleStartEdit(opt)}>
                {opt.label}
              </span>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => handleStartEdit(opt)}
              >
                <IconPencil size={12} />
              </ActionIcon>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => handleDelete(opt.id)}
              >
                <IconTrash size={12} />
              </ActionIcon>
            </>
          )}
        </div>
      ))}
      {showAddButton && (
        isAddingNew ? (
          <div className={styles.optionEditRow}>
            <TextInput
              value={newOptionLabel}
              onChange={(e) => setNewOptionLabel(e.target.value)}
              size="xs"
              placeholder="输入选项名称..."
              className={styles.optionEditInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddNew();
                if (e.key === "Escape") handleCancelAdd();
              }}
              autoFocus
            />
            <ActionIcon
              size="xs"
              variant="subtle"
              color="green"
              onClick={handleAddNew}
              disabled={!newOptionLabel.trim()}
            >
              <IconCheck size={12} />
            </ActionIcon>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              onClick={handleCancelAdd}
            >
              <IconTrash size={12} />
            </ActionIcon>
          </div>
        ) : (
          <div
            className={styles.optionItem}
            onClick={() => setIsAddingNew(true)}
            style={{ color: "var(--mantine-color-blue-6)" }}
          >
            <IconPlus size={14} />
            <span>添加选项</span>
          </div>
        )
      )}
    </Stack>
  );
}

function SelectCell({ value, onChange, editable, column, onUpdateOptions }: CellProps) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const options = column.options ?? [];
  const selectedOption = options.find((o) => o.id === value);

  // Filter options based on search
  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  
  const exactMatch = options.find(o => o.label.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (optionId: string) => {
    // Toggle logic: if clicking the already selected one, clear it? 
    // Usually single select allows clearing by clicking 'x' or selecting another.
    // Let's allow clearing if clicking the same one.
    if (value === optionId) {
      onChange(null);
    } else {
      onChange(optionId);
    }
    setOpened(false);
    setSearch("");
  };

  const handleCreate = () => {
    if (!search.trim()) return;
    if (exactMatch) {
      handleSelect(exactMatch.id);
      return;
    }
    
    const newOption: SelectOption = {
      id: uuid7(),
      label: search.trim(),
      color: getRandomOptionColor(),
    };
    onUpdateOptions?.([...options, newOption]);
    onChange(newOption.id);
    setOpened(false);
    setSearch("");
  };

  const handleUpdateOptionLabel = (id: string, newLabel: string) => {
    const newOptions = options.map(o => o.id === id ? { ...o, label: newLabel } : o);
    onUpdateOptions?.(newOptions);
    setEditingOptionId(null);
  };

  const handleUpdateOptionColor = (id: string, newColor: string) => {
    const newOptions = options.map(o => o.id === id ? { ...o, color: newColor } : o);
    onUpdateOptions?.(newOptions);
  };

  const handleDeleteOption = (id: string) => {
    const newOptions = options.filter(o => o.id !== id);
    onUpdateOptions?.(newOptions);
    if (value === id) {
      onChange(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
    if (e.key === "Backspace" && search === "" && value) {
      // Remove selected value
      onChange(null);
    }
  };

  return (
    <Popover 
      opened={opened && editable} 
      onChange={setOpened} 
      position="bottom-start" 
      withinPortal
      width={260}
      trapFocus
    >
      <Popover.Target>
        <div
          className={styles.selectTags}
          onClick={() => editable && setOpened(true)}
          style={{ minHeight: 28, cursor: editable ? "pointer" : "default" }}
        >
          {selectedOption ? (
            <span
              className={styles.selectTag}
              style={{ backgroundColor: selectedOption.color }}
            >
              {selectedOption.label}
            </span>
          ) : (
            editable && <span className={styles.selectPlaceholder}>选择...</span>
          )}
        </div>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack gap="xs">
          {/* Search Input Area */}
          <div 
            style={{
              display: "flex",
              gap: 4,
              padding: "4px 8px",
              border: "1px solid var(--mantine-color-blue-5)",
              borderRadius: 4,
              minHeight: 32,
              alignItems: "center"
            }}
          >
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索或创建..."
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                flex: 1,
                color: "var(--mantine-color-text)"
              }}
            />
          </div>

          <Text size="xs" c="dimmed" fw={500}>选择或新建一个标签</Text>

          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <Stack gap={2}>
              {filteredOptions.map((opt) => {
                const isSelected = value === opt.id;
                const isEditing = editingOptionId === opt.id;

                if (isEditing) {
                  return (
                    <div key={opt.id} className={styles.optionEditRow}>
                      <TextInput
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        size="xs"
                        autoFocus
                        onBlur={() => handleUpdateOptionLabel(opt.id, editingLabel)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdateOptionLabel(opt.id, editingLabel);
                          if (e.key === "Escape") setEditingOptionId(null);
                        }}
                        style={{ flex: 1 }}
                      />
                    </div>
                  );
                }

                return (
                  <div 
                    key={opt.id} 
                    className={styles.optionItem}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 4 }}
                  >
                    <div 
                      style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}
                      onClick={() => handleSelect(opt.id)}
                    >
                      <div style={{ width: 16, display: "flex", justifyContent: "center" }}>
                        {isSelected && <IconCheck size={14} />} 
                      </div>
                      <span
                        className={styles.selectTag}
                        style={{ backgroundColor: opt.color, margin: 0 }}
                      >
                        {opt.label}
                      </span>
                    </div>

                    <Menu position="right" withinPortal>
                      <Menu.Target>
                        <ActionIcon size="xs" variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Label>编辑标签</Menu.Label>
                        <Menu.Item 
                          leftSection={<IconPencil size={14} />}
                          onClick={() => {
                            setEditingOptionId(opt.id);
                            setEditingLabel(opt.label);
                          }}
                        >
                          重命名
                        </Menu.Item>
                        <Menu.Item 
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => handleDeleteOption(opt.id)}
                        >
                          删除
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Label>颜色</Menu.Label>
                        <div style={{ padding: "4px 12px", display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {OPTION_COLORS.map(c => (
                            <div
                              key={c}
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                backgroundColor: c,
                                cursor: "pointer",
                                border: opt.color === c ? "1px solid var(--mantine-color-text)" : "1px solid transparent"
                              }}
                              onClick={() => handleUpdateOptionColor(opt.id, c)}
                            />
                          ))}
                        </div>
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                );
              })}

              {search && !exactMatch && (
                <div 
                  className={styles.optionItem} 
                  onClick={handleCreate}
                  style={{ color: "var(--mantine-color-blue-6)" }}
                >
                  <IconPlus size={14} />
                  <span style={{ marginLeft: 8 }}>创建 "{search}"</span>
                </div>
              )}
              
              {filteredOptions.length === 0 && !search && (
                <Text size="xs" c="dimmed" ta="center" py="xs">无标签</Text>
              )}
            </Stack>
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function MultiSelectCell({ value, onChange, editable, column, onUpdateOptions }: CellProps) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  
  const options = column.options ?? [];
  const selectedIds: string[] = Array.isArray(value) ? value : [];
  const selectedOptions = options.filter((o) => selectedIds.includes(o.id));

  // Filter options based on search
  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  
  const exactMatch = options.find(o => o.label.toLowerCase() === search.trim().toLowerCase());

  const handleToggle = (optionId: string) => {
    const newIds = selectedIds.includes(optionId)
      ? selectedIds.filter(id => id !== optionId)
      : [...selectedIds, optionId];
    onChange(newIds);
    // Keep search focus and maybe clear search? Notion keeps search.
    // setSearch(""); 
  };

  const handleCreate = () => {
    if (!search.trim()) return;
    if (exactMatch) {
      if (!selectedIds.includes(exactMatch.id)) {
        handleToggle(exactMatch.id);
      }
      setSearch("");
      return;
    }
    
    const newOption: SelectOption = {
      id: uuid7(),
      label: search.trim(),
      color: getRandomOptionColor(),
    };
    onUpdateOptions?.([...options, newOption]);
    onChange([...selectedIds, newOption.id]);
    setSearch("");
  };

  const handleUpdateOptionLabel = (id: string, newLabel: string) => {
    const newOptions = options.map(o => o.id === id ? { ...o, label: newLabel } : o);
    onUpdateOptions?.(newOptions);
    setEditingOptionId(null);
  };

  const handleUpdateOptionColor = (id: string, newColor: string) => {
    const newOptions = options.map(o => o.id === id ? { ...o, color: newColor } : o);
    onUpdateOptions?.(newOptions);
  };

  const handleDeleteOption = (id: string) => {
    const newOptions = options.filter(o => o.id !== id);
    onUpdateOptions?.(newOptions);
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(sid => sid !== id));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
    if (e.key === "Backspace" && search === "" && selectedIds.length > 0) {
      // Remove last selected tag
      const newIds = selectedIds.slice(0, -1);
      onChange(newIds);
    }
  };

  return (
    <Popover 
      opened={opened && editable} 
      onChange={setOpened} 
      position="bottom-start" 
      withinPortal
      width={260}
      trapFocus
    >
      <Popover.Target>
        <div
          className={styles.selectTags}
          onClick={() => editable && setOpened(true)}
          style={{ minHeight: 28, cursor: editable ? "pointer" : "default" }}
        >
          {selectedOptions.length > 0 ? (
            selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className={styles.selectTag}
                style={{ backgroundColor: opt.color }}
              >
                {opt.label}
              </span>
            ))
          ) : (
            editable && <span className={styles.selectPlaceholder}>选择...</span>
          )}
        </div>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack gap="xs">
          {/* Search & Selected Tags Input Area */}
          <div 
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              padding: 4,
              border: "1px solid var(--mantine-color-blue-5)",
              borderRadius: 4,
              minHeight: 32,
              alignItems: "center"
            }}
          >
            {selectedOptions.map(opt => (
              <Badge 
                key={opt.id} 
                variant="filled" 
                color={opt.color}
                size="sm"
                radius="sm"
                rightSection={
                  <IconX 
                    size={10} 
                    style={{ cursor: "pointer", marginTop: 2 }} 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(opt.id);
                    }}
                  />
                }
                styles={{
                  root: { 
                    backgroundColor: opt.color, 
                    color: "var(--mantine-color-text)",
                    textTransform: "none",
                    fontWeight: 500,
                    height: 22
                  }
                }}
              >
                {opt.label}
              </Badge>
            ))}
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedOptions.length === 0 ? "搜索或创建..." : ""}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                flex: 1,
                minWidth: 60,
                color: "var(--mantine-color-text)"
              }}
            />
          </div>

          <Text size="xs" c="dimmed" fw={500}>选择或新建一个标签</Text>

          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <Stack gap={2}>
              {filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                const isEditing = editingOptionId === opt.id;

                if (isEditing) {
                  return (
                    <div key={opt.id} className={styles.optionEditRow}>
                      <TextInput
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        size="xs"
                        autoFocus
                        onBlur={() => handleUpdateOptionLabel(opt.id, editingLabel)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdateOptionLabel(opt.id, editingLabel);
                          if (e.key === "Escape") setEditingOptionId(null);
                        }}
                        style={{ flex: 1 }}
                      />
                    </div>
                  );
                }

                return (
                  <div 
                    key={opt.id} 
                    className={styles.optionItem}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 4 }}
                  >
                    <div 
                      style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}
                      onClick={() => handleToggle(opt.id)}
                    >
                      <div style={{ width: 16, display: "flex", justifyContent: "center" }}>
                        {isSelected ? <IconCheck size={14} /> : <IconDots size={14} style={{ opacity: 0 }} />} 
                        {/* Placeholder for alignment if needed, or just IconCheck */}
                      </div>
                      <span
                        className={styles.selectTag}
                        style={{ backgroundColor: opt.color, margin: 0 }}
                      >
                        {opt.label}
                      </span>
                    </div>

                    <Menu position="right" withinPortal>
                      <Menu.Target>
                        <ActionIcon size="xs" variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Label>编辑标签</Menu.Label>
                        <Menu.Item 
                          leftSection={<IconPencil size={14} />}
                          onClick={() => {
                            setEditingOptionId(opt.id);
                            setEditingLabel(opt.label);
                          }}
                        >
                          重命名
                        </Menu.Item>
                        <Menu.Item 
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => handleDeleteOption(opt.id)}
                        >
                          删除
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Label>颜色</Menu.Label>
                        <div style={{ padding: "4px 12px", display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {OPTION_COLORS.map(c => (
                            <div
                              key={c}
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                backgroundColor: c,
                                cursor: "pointer",
                                border: opt.color === c ? "1px solid var(--mantine-color-text)" : "1px solid transparent"
                              }}
                              onClick={() => handleUpdateOptionColor(opt.id, c)}
                            />
                          ))}
                        </div>
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                );
              })}

              {search && !exactMatch && (
                <div 
                  className={styles.optionItem} 
                  onClick={handleCreate}
                  style={{ color: "var(--mantine-color-blue-6)" }}
                >
                  <IconPlus size={14} />
                  <span style={{ marginLeft: 8 }}>创建 "{search}"</span>
                </div>
              )}
              
              {filteredOptions.length === 0 && !search && (
                <Text size="xs" c="dimmed" ta="center" py="xs">无标签</Text>
              )}
            </Stack>
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function CreatedTimeCell({ row }: CellProps) {
  if (!row || !row.createdAt) return null;
  const date = new Date(row.createdAt);
  return (
    <div style={{ fontSize: 13, color: "var(--mantine-color-dimmed)" }}>
      {date.toLocaleString()}
    </div>
  );
}

function UpdatedTimeCell({ row }: CellProps) {
  if (!row || !row.updatedAt) return null;
  const date = new Date(row.updatedAt);
  return (
    <div style={{ fontSize: 13, color: "var(--mantine-color-dimmed)" }}>
      {date.toLocaleString()}
    </div>
  );
}

function CellRenderer(props: CellProps) {
  const { column } = props;

  switch (column.type) {
    case "text":
      return <TextCell {...props} />;
    case "number":
      return <NumberCell {...props} />;
    case "date":
      return <DateCell {...props} />;
    case "checkbox":
      return <CheckboxCell {...props} />;
    case "select":
      return <SelectCell {...props} />;
    case "multiSelect":
      return <MultiSelectCell {...props} />;
    case "url":
      return <UrlCell {...props} />;
    case "file":
      return <FileCell {...props} />;
    case "page":
      return <PageCell {...props} />;
    case "createdTime":
      return <CreatedTimeCell {...props} />;
    case "updatedTime":
      return <UpdatedTimeCell {...props} />;
    default:
      return <TextCell {...props} />;
  }
}

// ============================================================
// Field Editor (Column Settings Popover)
// ============================================================
interface FieldEditorProps {
  column: ColumnData;
  ydoc: Y.Doc;
  onClose: () => void;
  onDelete: () => void;
}

function FieldEditor({ column, ydoc, onClose, onDelete }: FieldEditorProps) {
  const [name, setName] = useState(column.name);
  const [type, setType] = useState<FieldType>(column.type);
  const [options, setOptions] = useState<SelectOption[]>(column.options ?? []);
  const [typeMenuOpened, setTypeMenuOpened] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync state with props
  useEffect(() => {
    setName(column.name);
    setType(column.type);
    setOptions(column.options ?? []);
  }, [column]);

  // 自动选中输入框内容
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  }, []);

  const handleNameChange = (newName: string) => {
    setName(newName);
    ydoc.transact(() => {
      column.ymap.set("name", newName);
    });
  };

  const handleTypeChange = (newType: FieldType) => {
    setType(newType);
    ydoc.transact(() => {
      column.ymap.set("type", newType);
    });
    setTypeMenuOpened(false);
  };

  const handleUpdateOptions = (newOptions: SelectOption[]) => {
    setOptions(newOptions);
    ydoc.transact(() => {
      column.ymap.set("options", newOptions);
    });
  };

  const handleInsertLeft = () => {
    const colsArray = ydoc.getArray<Y.Map<any>>("columns");
    const index = colsArray.toArray().findIndex(c => c.get("id") === column.id);
    if (index !== -1) {
      ydoc.transact(() => {
        const newCol = new Y.Map<any>();
        newCol.set("id", uuid7());
        newCol.set("name", "新列");
        newCol.set("type", "text");
        newCol.set("width", GridSize.defaultColumnWidth);
        colsArray.insert(index, [newCol]);
      });
    }
    onClose();
  };

  const handleInsertRight = () => {
    const colsArray = ydoc.getArray<Y.Map<any>>("columns");
    const index = colsArray.toArray().findIndex(c => c.get("id") === column.id);
    if (index !== -1) {
      ydoc.transact(() => {
        const newCol = new Y.Map<any>();
        newCol.set("id", uuid7());
        newCol.set("name", "新列");
        newCol.set("type", "text");
        newCol.set("width", GridSize.defaultColumnWidth);
        colsArray.insert(index + 1, [newCol]);
      });
    }
    onClose();
  };

  const handleClearColumn = () => {
    const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
    ydoc.transact(() => {
      rowsArray.forEach((row) => {
        const cells = row.get("cells") as Y.Map<any>;
        if (cells && cells.has(column.id)) {
          cells.delete(column.id);
        }
      });
    });
    onClose();
  };

  const handleHide = () => {
    ydoc.transact(() => {
      column.ymap.set("hidden", true);
    });
    onClose();
  };

  const handleCopy = () => {
    const colsArray = ydoc.getArray<Y.Map<any>>("columns");
    const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
    const newColId = uuid7();
    
    ydoc.transact(() => {
      // 1. Create new column
      const newCol = new Y.Map<any>();
      newCol.set("id", newColId);
      newCol.set("name", column.name + " copy");
      newCol.set("type", column.type);
      newCol.set("width", column.width);
      if (column.options) {
        newCol.set("options", JSON.parse(JSON.stringify(column.options)));
      }
      
      // Insert after current column
      const index = colsArray.toArray().findIndex(c => c.get("id") === column.id);
      if (index !== -1) {
        colsArray.insert(index + 1, [newCol]);
      } else {
        colsArray.push([newCol]);
      }

      // 2. Copy cell values
      rowsArray.forEach((row) => {
        const cells = row.get("cells") as Y.Map<any>;
        if (cells && cells.has(column.id)) {
          const val = cells.get(column.id);
          cells.set(newColId, val); 
        }
      });
    });
    
    onClose();
  };

  const getFieldTypeIcon = (fieldType: FieldType, size = 18) => {
    const iconProps = { size, stroke: 1.5 };
    const iconMap: Record<FieldType, React.ReactNode> = {
      text: <IconAlignLeft {...iconProps} />,
      number: <IconHash {...iconProps} />,
      date: <IconCalendar {...iconProps} />,
      select: <IconCircleDot {...iconProps} />,
      multiSelect: <IconList {...iconProps} />,
      checkbox: <IconSquareCheck {...iconProps} />,
      url: <IconLink {...iconProps} />,
      file: <IconPaperclip {...iconProps} />,
      page: <IconFileDescription {...iconProps} />,
      createdTime: <IconCalendarPlus {...iconProps} />,
      updatedTime: <IconClock {...iconProps} />,
    };
    return iconMap[fieldType] || <IconAlignLeft {...iconProps} />;
  };

  const getFieldTypeName = (fieldType: FieldType) => {
    const nameMap: Record<FieldType, string> = {
      text: "文本",
      number: "数字",
      date: "日期",
      select: "单项选择器",
      multiSelect: "多项选择器",
      checkbox: "勾选框",
      url: "链接",
      file: "文件",
      page: "页面",
      createdTime: "创建时间",
      updatedTime: "修改时间",
    };
    return nameMap[fieldType] || "文本";
  };

  // 主菜单
  return (
    <div 
      className={styles.fieldEditorModern}
      onClick={(e) => {
        console.log('[FieldEditor] main container clicked');
        e.stopPropagation();
      }}
    >
      {/* 列名输入框 */}
      <div className={styles.fieldInputContainer}>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className={styles.fieldInput}
          placeholder="列名称"
        />
      </div>

      {/* 类型选择 */}
      <Popover 
        opened={typeMenuOpened}
        onChange={setTypeMenuOpened}
        position="right-start" 
        withinPortal 
        offset={4}
        closeOnClickOutside={true}
      >
        <Popover.Target>
          <div className={styles.menuItem} onClick={() => setTypeMenuOpened((o) => !o)}>
            <div className={styles.menuIconWrapper}>
              {getFieldTypeIcon(type)}
            </div>
            <span className={styles.menuLabel}>类型</span>
            <span className={styles.menuValue}>{getFieldTypeName(type)}</span>
            <IconChevronRight size={14} className={styles.menuChevron} />
          </div>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <div className={styles.fieldEditorModern}>
            <div 
              className={`${styles.menuItem} ${type === "text" ? styles.active : ""}`}
              onClick={() => handleTypeChange("text")}
            >
              <IconAlignLeft size={18} stroke={1.5} className={styles.menuIcon} />
              <span>文本</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "number" ? styles.active : ""}`}
              onClick={() => handleTypeChange("number")}
            >
              <IconHash size={18} stroke={1.5} className={styles.menuIcon} />
              <span>数字</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "select" ? styles.active : ""}`}
              onClick={() => handleTypeChange("select")}
            >
              <IconCircleDot size={18} stroke={1.5} className={styles.menuIcon} />
              <span>单项选择器</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "multiSelect" ? styles.active : ""}`}
              onClick={() => handleTypeChange("multiSelect")}
            >
              <IconList size={18} stroke={1.5} className={styles.menuIcon} />
              <span>多项选择器</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "date" ? styles.active : ""}`}
              onClick={() => handleTypeChange("date")}
            >
              <IconCalendar size={18} stroke={1.5} className={styles.menuIcon} />
              <span>日期</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "file" ? styles.active : ""}`}
              onClick={() => handleTypeChange("file")}
            >
              <IconPaperclip size={18} stroke={1.5} className={styles.menuIcon} />
              <span>Files & media</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "page" ? styles.active : ""}`}
              onClick={() => handleTypeChange("page")}
            >
              <IconFileDescription size={18} stroke={1.5} className={styles.menuIcon} />
              <span>页面</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "url" ? styles.active : ""}`}
              onClick={() => handleTypeChange("url")}
            >
              <IconLink size={18} stroke={1.5} className={styles.menuIcon} />
              <span>链接</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "checkbox" ? styles.active : ""}`}
              onClick={() => handleTypeChange("checkbox")}
            >
              <IconSquareCheck size={18} stroke={1.5} className={styles.menuIcon} />
              <span>勾选框</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "updatedTime" ? styles.active : ""}`}
              onClick={() => handleTypeChange("updatedTime")}
            >
              <IconClock size={18} stroke={1.5} className={styles.menuIcon} />
              <span>修改时间</span>
            </div>
            <div 
              className={`${styles.menuItem} ${type === "createdTime" ? styles.active : ""}`}
              onClick={() => handleTypeChange("createdTime")}
            >
              <IconCalendarPlus size={18} stroke={1.5} className={styles.menuIcon} />
              <span>创建时间</span>
            </div>
          </div>
        </Popover.Dropdown>
      </Popover>

      {/* 选择器类型的标签管理 */}
      {(type === "select" || type === "multiSelect") && (
        <div className={styles.optionsSection}>
          <div className={styles.optionsSectionTitle}>标签</div>
          <OptionsManager 
            options={options} 
            onUpdateOptions={handleUpdateOptions}
            showAddButton={true}
          />
        </div>
      )}

      <div className={styles.menuDivider} />

      {/* 插入列 */}
      <div className={styles.menuItem} onClick={handleInsertLeft}>
        <IconArrowLeft size={18} stroke={1.5} className={styles.menuIcon} />
        <span className={styles.menuLabel}>左侧插入</span>
      </div>
      <div className={styles.menuItem} onClick={handleInsertRight}>
        <IconArrowRight size={18} stroke={1.5} className={styles.menuIcon} />
        <span className={styles.menuLabel}>右侧插入</span>
      </div>

      {/* 隐藏 */}
      <div className={styles.menuItem} onClick={handleHide}>
        <IconEyeOff size={18} stroke={1.5} className={styles.menuIcon} />
        <span className={styles.menuLabel}>隐藏</span>
      </div>

      {/* 复制 */}
      <div className={styles.menuItem} onClick={handleCopy}>
        <IconCopy size={18} stroke={1.5} className={styles.menuIcon} />
        <span className={styles.menuLabel}>复制</span>
      </div>

      {/* 清空 */}
      <div className={styles.menuItem} onClick={handleClearColumn}>
        <IconEraser size={18} stroke={1.5} className={styles.menuIcon} />
        <span className={styles.menuLabel}>清空单元格</span>
      </div>

      {/* 删除 */}
      <div 
        className={`${styles.menuItem} ${styles.danger}`}
        onClick={() => { onDelete(); onClose(); }}
      >
        <IconTrash size={18} stroke={1.5} className={styles.menuIcon} />
        <span className={styles.menuLabel}>删除</span>
      </div>
    </div>
  );
}

// ============================================================
function DatabaseTitle({ title, onChange, editable, onDelete }: { 
  title: string, 
  onChange: (val: string) => void, 
  editable: boolean,
  onDelete?: () => void 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    setValue(title);
  }, [title]);

  return (
    <>
      <div 
        className={styles.databaseTitleWrapper}
        onClick={() => !isEditing && editable && setIsEditing(true)}
      >
        <IconDatabase size={18} className={styles.databaseIcon} />
        {isEditing ? (
          <TextInput
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            onBlur={() => {
              setIsEditing(false);
              if (value !== title) onChange(value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditing(false);
                if (value !== title) onChange(value);
              }
              if (e.key === 'Escape') {
                setIsEditing(false);
                setValue(title);
              }
            }}
            autoFocus
            size="xs"
            variant="unstyled"
            classNames={{ input: styles.databaseTitleInput }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.databaseTitleText}>{title}</span>
        )}
        {editable && onDelete && (
          <Menu shadow="md" width={200} position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={(e) => e.stopPropagation()}
                style={{ marginLeft: 8 }}
              >
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>操作</Menu.Label>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteModalOpen(true);
                }}
              >
                删除数据库
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </div>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="删除数据库？"
        centered
        size="sm"
        styles={{
          title: { fontWeight: 600 },
          body: { paddingBottom: 20 }
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Text size="sm" c="dimmed" mb="lg">
          确定要永久删除此数据库吗？此操作无法撤销。
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setDeleteModalOpen(false)}>
            取消
          </Button>
          <Button 
            color="red" 
            onClick={() => {
              onDelete?.();
              setDeleteModalOpen(false);
            }}
          >
            删除
          </Button>
        </Group>
      </Modal>
    </>
  );
}

// ============================================================
// Main Component
// ============================================================
export default function DatabaseRefView(props: NodeViewProps) {
  const { node, editor, deleteNode } = props;
  const databaseId = node.attrs.databaseId as string | undefined;
  const viewId = node.attrs.viewId as string | undefined;
  const { pageId: routePageId } = useParams();
  const pageId = routePageId || editor?.storage?.pageId;

  const collabUrl = useCollaborationUrl();
  const { data: collabQuery, refetch: refetchCollabToken } = useCollabToken();

  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const infoQuery = useQuery<DocDatabaseInfoResponse>({
    queryKey: ["doc-database", databaseId],
    queryFn: () => getDocDatabaseInfo({ databaseId: databaseId! }),
    enabled: !!databaseId,
    staleTime: 30_000,
  });

  const queryClient = useQueryClient();
  const updateDatabaseMutation = useMutation({
    mutationFn: updateDocDatabase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doc-database", databaseId] });
    },
  });

  const handleTitleChange = (newTitle: string) => {
    if (!databaseId) return;
    updateDatabaseMutation.mutate({ databaseId, title: newTitle });
  };

  const handleDeleteDatabase = useCallback(() => {
    if (!editor) return;
    // 删除当前节点
    deleteNode();
  }, [editor, deleteNode]);

  // Yjs Document
  const ydocRef = useRef<Y.Doc | null>(null);
  const hasInitialized = useRef(false);
  
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }
  const ydoc = ydocRef.current;

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>(WebSocketStatus.Disconnected);
  const [version, setVersion] = useState(0);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Listen to Yjs updates
  useEffect(() => {
    const onUpdate = () => {
      Promise.resolve().then(() => {
        if (!isMountedRef.current) return;
        setVersion((v) => v + 1);
      });
    };
    ydoc.on("update", onUpdate);
    return () => {
      ydoc.off("update", onUpdate);
    };
  }, [ydoc]);

  // Backfill missing metadata for legacy rows
  useEffect(() => {
    const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
    ydoc.transact(() => {
      rowsArray.forEach((row) => {
        if (!row.has("createdAt")) {
          row.set("createdAt", Date.now());
        }
        if (!row.has("updatedAt")) {
          row.set("updatedAt", Date.now());
        }
      });
    });
  }, [ydoc, version]);

  // Connect to Hocuspocus
  useEffect(() => {
    if (!databaseId) return;
    if (providerRef.current) return;

    const documentName = `database.${databaseId}`;
    const provider = new HocuspocusProvider({
      name: documentName,
      url: collabUrl,
      document: ydoc,
      token: collabQuery?.token,
      connect: true,
      preserveConnection: false,
      onAuthenticationFailed: () => {
        refetchCollabToken().then((result) => {
          if (!isMountedRef.current) return;
          if (!providerRef.current) return;
          if (result.data?.token) {
            provider.disconnect();
            provider.configuration.token = result.data.token;
            provider.connect();
          }
        });
      },
      onSynced: () => {
        // Initialize only once when synced and if empty
        if (!hasInitialized.current) {
          const columns = ydoc.getArray<Y.Map<any>>("columns");
          if (columns.length === 0) {
            console.log('[DatabaseRefView] Initializing empty database');
            ensureInitialized(ydoc);
          }
          hasInitialized.current = true;
        }
      },
      onStatus: (s) => {
        Promise.resolve().then(() => {
          if (!isMountedRef.current) return;
          setStatus(s.status);
        });
      },
    });

    providerRef.current = provider;

    return () => {
      providerRef.current?.destroy();
      providerRef.current = null;
    };
  }, [databaseId, collabUrl, collabQuery?.token, refetchCollabToken, ydoc]);

  // Read data from Yjs
  const columns = useMemo(() => {
    void version;
    return readColumns(ydoc);
  }, [ydoc, version]);

  const rows = useMemo(() => {
    void version;
    return readRows(ydoc);
  }, [ydoc, version]);

  const title = infoQuery.data?.data?.database?.title ?? "未命名数据库";
  const isEditable = editor.isEditable;

  // Cell value operations
  const setCellValue = useCallback(
    (rowId: string, columnId: string, value: any) => {
      const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
      const row = rowsArray.toArray().find((r) => r.get("id") === rowId);
      if (!row) return;

      ydoc.transact(() => {
        let cells = row.get("cells") as Y.Map<any>;
        if (!cells) {
          cells = new Y.Map<any>();
          row.set("cells", cells);
        }
        cells.set(columnId, value);
        row.set("updatedAt", Date.now());
      });
    },
    [ydoc]
  );

  const updateColumnOptions = useCallback(
    (columnId: string, options: SelectOption[]) => {
      const columnsArray = ydoc.getArray<Y.Map<any>>("columns");
      const col = columnsArray.toArray().find((c) => c.get("id") === columnId);
      if (!col) return;

      ydoc.transact(() => {
        col.set("options", options);
      });
    },
    [ydoc]
  );

  // Add row
  const addRow = useCallback(() => {
    if (!isEditable) return;
    const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
    ydoc.transact(() => {
      const row = new Y.Map<any>();
      row.set("id", uuid7());
      row.set("cells", new Y.Map());
      row.set("createdAt", Date.now());
      row.set("updatedAt", Date.now());
      rowsArray.push([row]);
    });
  }, [ydoc, isEditable]);

  // Add column
  const addColumn = useCallback(() => {
    if (!isEditable) return;
    const colsArray = ydoc.getArray<Y.Map<any>>("columns");
    ydoc.transact(() => {
      const col = new Y.Map<any>();
      col.set("id", uuid7());
      col.set("name", "新列");
      col.set("type", "text");
      col.set("width", GridSize.defaultColumnWidth);
      colsArray.push([col]);
    });
  }, [ydoc, isEditable]);

  // Delete column
  const deleteColumn = useCallback(
    (columnId: string) => {
      if (!isEditable) return;
      const colsArray = ydoc.getArray<Y.Map<any>>("columns");
      const index = colsArray.toArray().findIndex((c) => c.get("id") === columnId);
      if (index >= 0) {
        ydoc.transact(() => {
          colsArray.delete(index, 1);
        });
      }
      setEditingColumnId(null);
    },
    [ydoc, isEditable]
  );

  // Delete row
  const deleteRow = useCallback(
    (rowId: string) => {
      if (!isEditable) return;
      const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
      const index = rowsArray.toArray().findIndex((r) => r.get("id") === rowId);
      if (index >= 0) {
        ydoc.transact(() => {
          rowsArray.delete(index, 1);
        });
      }
    },
    [ydoc, isEditable]
  );

  // Duplicate row
  const duplicateRow = useCallback(
    (rowId: string) => {
      if (!isEditable) return;
      const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
      const sourceRow = rowsArray.toArray().find((r) => r.get("id") === rowId);
      if (!sourceRow) return;

      ydoc.transact(() => {
        const newRow = new Y.Map<any>();
        newRow.set("id", uuid7());
        newRow.set("createdAt", Date.now());
        newRow.set("updatedAt", Date.now());
        const newCells = new Y.Map<any>();
        const sourceCells = sourceRow.get("cells") as Y.Map<any>;
        if (sourceCells) {
          sourceCells.forEach((value, key) => {
            newCells.set(key, value);
          });
        }
        newRow.set("cells", newCells);
        rowsArray.push([newRow]);
      });
    },
    [ydoc, isEditable]
  );

  // Insert row above
  const insertRowAbove = useCallback(
    (rowId: string) => {
      if (!isEditable) return;
      const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
      const index = rowsArray.toArray().findIndex((r) => r.get("id") === rowId);
      if (index < 0) return;

      ydoc.transact(() => {
        const row = new Y.Map<any>();
        row.set("id", uuid7());
        row.set("cells", new Y.Map());
        row.set("createdAt", Date.now());
        row.set("updatedAt", Date.now());
        rowsArray.insert(index, [row]);
      });
    },
    [ydoc, isEditable]
  );

  // Insert row below
  const insertRowBelow = useCallback(
    (rowId: string) => {
      if (!isEditable) return;
      const rowsArray = ydoc.getArray<Y.Map<any>>("rows");
      const index = rowsArray.toArray().findIndex((r) => r.get("id") === rowId);
      if (index < 0) return;

      ydoc.transact(() => {
        const row = new Y.Map<any>();
        row.set("id", uuid7());
        row.set("cells", new Y.Map());
        row.set("createdAt", Date.now());
        row.set("updatedAt", Date.now());
        rowsArray.insert(index + 1, [row]);
      });
    },
    [ydoc, isEditable]
  );

  // Column resize handlers
  const handleResizeStart = useCallback(
    (e: React.PointerEvent, columnId: string, currentWidth: number) => {
      e.preventDefault();
      setResizingColumnId(columnId);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = currentWidth;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handleResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizingColumnId) return;
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(GridSize.minColumnWidth, resizeStartWidth.current + delta);

      const colsArray = ydoc.getArray<Y.Map<any>>("columns");
      const col = colsArray.toArray().find((c) => c.get("id") === resizingColumnId);
      if (col) {
        col.set("width", newWidth);
      }
    },
    [resizingColumnId, ydoc]
  );

  const handleResizeEnd = useCallback(() => {
    setResizingColumnId(null);
  }, []);

  // Build react-table data
  const columnHelper = createColumnHelper<RowData>();

  const tableColumns = useMemo(() => {
    return columns.map((col) =>
      columnHelper.accessor(
        (row) => {
          const value = row.cells.get(col.id);
          return value;
        },
        {
          id: col.id,
          header: () => col.name,
          cell: (info) => {
            const row = info.row.original;
            const value = row.cells.get(col.id);
            return (
              <CellRenderer
                key={`${col.id}-${col.type}`}
                value={value}
                onChange={(v) => setCellValue(row.id, col.id, v)}
                editable={isEditable}
                column={col}
                onUpdateOptions={(opts) => updateColumnOptions(col.id, opts)}
                row={row}
                pageId={pageId}
              />
            );
          },
          size: col.width,
        }
      )
    );
  }, [columns, columnHelper, setCellValue, isEditable, updateColumnOptions, pageId]);

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const isLoading = infoQuery.isLoading || !databaseId;

  if (isLoading) {
    return (
      <NodeViewWrapper data-drag-handle>
        <Group gap="xs" p="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">数据库加载中…</Text>
        </Group>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-drag-handle>
      <Stack gap="xs">
        {/* Title Bar */}
        <Group justify="space-between">
          <Group gap="xs">
            <DatabaseTitle 
              title={title} 
              onChange={handleTitleChange} 
              editable={isEditable}
              onDelete={handleDeleteDatabase}
            />
            {status !== WebSocketStatus.Connected && (
              <Group gap={4}>
                <Loader size="xs" />
                <Text size="xs" c="dimmed">同步中</Text>
              </Group>
            )}
          </Group>
        </Group>

        {/* Table */}
        <div className={styles.tableContainer}>
          {/* Table Scroll Area */}
          <div className={styles.tableScrollArea}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr className={styles.headerRow}>
                    {columns.map((col) => (
                      <th
                        key={col.id}
                        className={styles.headerCell}
                        style={{ width: col.width }}
                      >
                        <Popover
                        opened={editingColumnId === col.id}
                        onClose={() => {
                          console.log('[Popover] onClose triggered for column:', col.id);
                          setEditingColumnId(null);
                        }}
                        onChange={(opened) => {
                          console.log('[Popover] onChange:', { opened, colId: col.id, editingColumnId });
                          // 关键修复：当 opened 为 false 时，更新状态关闭弹框
                          if (!opened) {
                            setEditingColumnId(null);
                          }
                        }}
                        position="bottom-start"
                        withinPortal
                        closeOnClickOutside={true}
                        trapFocus={false}
                    >
                      <Popover.Target>
                        <div
                          className={styles.headerCellContent}
                          onClick={() => {
                            console.log('[Popover.Target] clicked, isEditable:', isEditable, 'colId:', col.id);
                            isEditable && setEditingColumnId(col.id);
                          }}
                        >
                          <span>{col.name}</span>
                          <IconChevronDown size={14} />
                        </div>
                      </Popover.Target>
                      <Popover.Dropdown p="sm">
                        <FieldEditor
                          column={col}
                          ydoc={ydoc}
                          onClose={() => {
                            console.log('[FieldEditor] onClose called');
                            setEditingColumnId(null);
                          }}
                          onDelete={() => deleteColumn(col.id)}
                        />
                      </Popover.Dropdown>
                    </Popover>
                    {/* Resize Handle */}
                    <div
                      className={`${styles.resizeHandle} ${resizingColumnId === col.id ? styles.resizing : ""}`}
                      onPointerDown={(e) => handleResizeStart(e, col.id, col.width)}
                      onPointerMove={handleResizeMove}
                      onPointerUp={handleResizeEnd}
                    />
                  </th>
                ))}
                {/* Add Column Button */}
                {isEditable && (
                  <th className={`${styles.headerCell} ${styles.addColumnCell}`}>
                    <div className={styles.addColumnBtn} onClick={addColumn}>
                      <IconPlus size={14} />
                      <span>添加列</span>
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={styles.row}>
                  {row.getVisibleCells().map((cell, cellIndex) => (
                    <td
                      key={cell.id}
                      className={styles.cell}
                      style={{ 
                        width: cell.column.getSize(),
                        position: cellIndex === 0 ? 'relative' : undefined,
                      }}
                    >
                      {/* Row Actions - 只在第一个单元格显示 */}
                      {cellIndex === 0 && isEditable && (
                        <div className={styles.rowActions}>
                          {/* 快捷添加行按钮 */}
                          <div 
                            className={styles.rowActionBtn}
                            onClick={() => insertRowBelow(row.original.id)}
                            title="点击添加到下方"
                          >
                            <IconPlus size={14} />
                          </div>
                          {/* 行操作菜单 */}
                          <Menu position="bottom-start" withinPortal>
                            <Menu.Target>
                              <div className={styles.rowActionBtn} title="更多操作">
                                <IconGripVertical size={14} />
                              </div>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconArrowUp size={14} />}
                                onClick={() => insertRowAbove(row.original.id)}
                              >
                                在上方插入记录
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconRowInsertBottom size={14} />}
                                onClick={() => insertRowBelow(row.original.id)}
                              >
                                点击添加到下方
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconCopy size={14} />}
                                onClick={() => duplicateRow(row.original.id)}
                              >
                                复制
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item
                                leftSection={<IconTrash size={14} />}
                                color="red"
                                onClick={() => deleteRow(row.original.id)}
                              >
                                删除
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </div>
                      )}
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  {/* Empty cell for add column */}
                  {isEditable && <td className={styles.cell} style={{ width: GridSize.newColumnBtnWidth }} />}
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </div>
        </div>
      </Stack>
    </NodeViewWrapper>
  );
}
