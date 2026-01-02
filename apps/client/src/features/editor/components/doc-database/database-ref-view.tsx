import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "@mantine/core";
import {
  IconChevronDown,
  IconCopy,
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconTrash,
  IconCheck,
  IconArrowUp,
  IconRowInsertBottom,
} from "@tabler/icons-react";
import { v7 as uuid7 } from "uuid";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";
import { useCollabToken } from "@/features/auth/queries/auth-query";
import {
  getDocDatabaseInfo,
  type DocDatabaseInfoResponse,
} from "@/features/editor/services/doc-database-service";
import { useQuery } from "@tanstack/react-query";
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
    ymap: c,
  }));
}

function readRows(doc: Y.Doc): RowData[] {
  const rows = doc.getArray<Y.Map<any>>("rows");
  return rows.toArray().map((r) => {
    const cells = r.get("cells") as Y.Map<any> | undefined;
    return {
      id: String(r.get("id")),
      cells: cells ?? new Y.Map<any>(),
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
        {localValue || (editable ? <span className={styles.selectPlaceholder}>点击编辑</span> : null)}
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
  // 将 ISO 日期字符串转换为 YYYY-MM-DD 格式
  const dateStr = value ? String(value).slice(0, 10) : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.currentTarget.value;
    onChange(val ? `${val}T00:00:00.000Z` : null);
  };

  return (
    <input
      type="date"
      className={styles.cellInput}
      value={dateStr}
      onChange={handleChange}
      disabled={!editable}
    />
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
  const [isManaging, setIsManaging] = useState(false);
  const options = column.options ?? [];
  const selectedOption = options.find((o) => o.id === value);

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setOpened(false);
    setIsManaging(false);
  };

  const handleUpdateOptions = (newOptions: SelectOption[]) => {
    onUpdateOptions?.(newOptions);
  };

  return (
    <Popover 
      opened={opened && editable} 
      onChange={(o) => {
        setOpened(o);
        if (!o) setIsManaging(false);
      }} 
      position="bottom-start" 
      withinPortal
      closeOnClickOutside={!isManaging}
    >
      <Popover.Target>
        <div
          className={styles.selectTags}
          onClick={() => editable && setOpened(true)}
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
        {isManaging ? (
          <Stack gap={4}>
            <div className={styles.optionSectionHeader}>
              <span>管理选项</span>
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => setIsManaging(false)}
              >
                <IconCheck size={12} />
              </ActionIcon>
            </div>
            <OptionsManager
              options={options}
              onUpdateOptions={handleUpdateOptions}
            />
          </Stack>
        ) : (
          <Stack gap={4}>
            {options.map((opt) => (
              <div
                key={opt.id}
                className={styles.optionItem}
                onClick={() => handleSelect(opt.id)}
              >
                <span
                  className={styles.optionColor}
                  style={{ backgroundColor: opt.color }}
                />
                <span>{opt.label}</span>
              </div>
            ))}
            <div
              className={styles.optionItem}
              onClick={() => setIsManaging(true)}
              style={{ color: "var(--mantine-color-blue-6)" }}
            >
              <IconPencil size={14} />
              <span>管理选项</span>
            </div>
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

function MultiSelectCell({ value, onChange, editable, column, onUpdateOptions }: CellProps) {
  const [isManaging, setIsManaging] = useState(false);
  const options = column.options ?? [];
  const selectedIds: string[] = Array.isArray(value) ? value : [];
  const selectedOptions = options.filter((o) => selectedIds.includes(o.id));

  const selectData = options.map((o) => ({ value: o.id, label: o.label }));

  const handleChange = (ids: string[]) => {
    onChange(ids);
  };

  const handleUpdateOptions = (newOptions: SelectOption[]) => {
    onUpdateOptions?.(newOptions);
  };

  if (!editable) {
    return (
      <div className={styles.selectTags}>
        {selectedOptions.map((opt) => (
          <span
            key={opt.id}
            className={styles.selectTag}
            style={{ backgroundColor: opt.color }}
          >
            {opt.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <Stack gap={4}>
      <MultiSelect
        data={selectData}
        value={selectedIds}
        onChange={handleChange}
        placeholder="选择..."
        searchable
        size="xs"
        styles={{
          input: {
            border: "none",
            background: "transparent",
            minHeight: 28,
          },
        }}
      />
      {isManaging ? (
        <Stack gap={4}>
          <div className={styles.optionSectionHeader}>
            <span style={{ fontSize: 12 }}>管理选项</span>
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={() => setIsManaging(false)}
            >
              <IconCheck size={12} />
            </ActionIcon>
          </div>
          <OptionsManager
            options={options}
            onUpdateOptions={handleUpdateOptions}
          />
        </Stack>
      ) : (
        <div
          className={styles.optionItem}
          onClick={() => setIsManaging(true)}
          style={{ color: "var(--mantine-color-blue-6)", fontSize: 12 }}
        >
          <IconPencil size={12} />
          <span>管理选项</span>
        </div>
      )}
    </Stack>
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

  const handleSave = () => {
    ydoc.transact(() => {
      column.ymap.set("name", name);
      column.ymap.set("type", type);
      if (type === "select" || type === "multiSelect") {
        column.ymap.set("options", options);
      }
    });
    onClose();
  };

  const handleAddOption = () => {
    const newOption: SelectOption = {
      id: uuid7(),
      label: `选项 ${options.length + 1}`,
      color: getRandomOptionColor(),
    };
    setOptions([...options, newOption]);
  };

  const handleUpdateOption = (id: string, updates: Partial<SelectOption>) => {
    setOptions(options.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  };

  const handleDeleteOption = (id: string) => {
    setOptions(options.filter((o) => o.id !== id));
  };

  return (
    <Stack gap="sm" className={styles.fieldEditor}>
      <TextInput
        label="列名"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        size="xs"
      />
      <Select
        label="类型"
        data={FIELD_TYPE_OPTIONS}
        value={type}
        onChange={(v) => setType((v as FieldType) ?? "text")}
        size="xs"
        comboboxProps={{ withinPortal: true, zIndex: 1000 }}
      />

      {(type === "select" || type === "multiSelect") && (
        <Stack gap="xs">
          <Text size="xs" fw={500}>选项</Text>
          {options.map((opt) => (
            <Group key={opt.id} gap="xs">
              <Popover position="bottom-start" withinPortal>
                <Popover.Target>
                  <div
                    className={styles.optionColor}
                    style={{ backgroundColor: opt.color, cursor: "pointer" }}
                  />
                </Popover.Target>
                <Popover.Dropdown p="xs">
                  <div className={styles.colorPicker}>
                    {OPTION_COLORS.map((color) => (
                      <div
                        key={color}
                        className={`${styles.colorOption} ${opt.color === color ? styles.selected : ""}`}
                        style={{ backgroundColor: color }}
                        onClick={() => handleUpdateOption(opt.id, { color })}
                      />
                    ))}
                  </div>
                </Popover.Dropdown>
              </Popover>
              <TextInput
                value={opt.label}
                onChange={(e) => handleUpdateOption(opt.id, { label: e.currentTarget.value })}
                size="xs"
                style={{ flex: 1 }}
              />
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => handleDeleteOption(opt.id)}
              >
                <IconTrash size={12} />
              </ActionIcon>
            </Group>
          ))}
          <div
            className={styles.optionItem}
            onClick={handleAddOption}
            style={{ color: "var(--mantine-color-blue-6)" }}
          >
            <IconPlus size={14} />
            <span>添加选项</span>
          </div>
        </Stack>
      )}

      <Group justify="space-between" mt="xs">
        <ActionIcon variant="subtle" color="red" onClick={onDelete}>
          <IconTrash size={16} />
        </ActionIcon>
        <Group gap="xs">
          <Badge variant="light" onClick={onClose} style={{ cursor: "pointer" }}>
            取消
          </Badge>
          <Badge color="blue" onClick={handleSave} style={{ cursor: "pointer" }}>
            保存
          </Badge>
        </Group>
      </Group>
    </Stack>
  );
}

// ============================================================
// Main Component
// ============================================================
export default function DatabaseRefView(props: NodeViewProps) {
  const { node, editor } = props;
  const databaseId = node.attrs.databaseId as string | undefined;
  const viewId = node.attrs.viewId as string | undefined;

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

  // Yjs Document
  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
    ensureInitialized(ydocRef.current);
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
                value={value}
                onChange={(v) => setCellValue(row.id, col.id, v)}
                editable={isEditable}
                column={col}
                onUpdateOptions={(opts) => updateColumnOptions(col.id, opts)}
              />
            );
          },
          size: col.width,
        }
      )
    );
  }, [columns, columnHelper, setCellValue, isEditable, updateColumnOptions]);

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
            <Text fw={600} size="lg">{title}</Text>
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
          {/* Row Actions Column */}
          {isEditable && (
            <div className={styles.rowActionsColumn}>
              {/* Header spacer */}
              <div style={{ height: 40 }} />
              {/* Row actions for each row */}
              {rows.map((row) => (
                <div key={row.id} className={styles.rowActionsCell}>
                  <div className={styles.rowActions}>
                    {/* 快捷添加行按钮 */}
                    <div 
                      className={styles.rowActionBtn}
                      onClick={() => insertRowBelow(row.id)}
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
                          onClick={() => insertRowAbove(row.id)}
                        >
                          在上方插入记录
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconRowInsertBottom size={14} />}
                          onClick={() => insertRowBelow(row.id)}
                        >
                          点击添加到下方
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconCopy size={14} />}
                          onClick={() => duplicateRow(row.id)}
                        >
                          复制
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => deleteRow(row.id)}
                        >
                          删除
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                        onClose={() => setEditingColumnId(null)}
                        position="bottom-start"
                        withinPortal
                        closeOnClickOutside={false}
                        trapFocus={false}
                    >
                      <Popover.Target>
                        <div
                          className={styles.headerCellContent}
                          onClick={() => isEditable && setEditingColumnId(col.id)}
                        >
                          <span>{col.name}</span>
                          <IconChevronDown size={14} />
                        </div>
                      </Popover.Target>
                      <Popover.Dropdown p="sm">
                        <FieldEditor
                          column={col}
                          ydoc={ydoc}
                          onClose={() => setEditingColumnId(null)}
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
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={styles.cell}
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  {/* Empty cell for add column */}
                  {isEditable && <td className={styles.cell} style={{ width: GridSize.newColumnBtnWidth }} />}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Add Row Button */}
          {isEditable && (
            <div className={styles.addRowBtn} onClick={addRow}>
              <IconPlus size={14} />
              <span>添加一行</span>
            </div>
          )}
            </div>
          </div>
        </div>
      </Stack>
    </NodeViewWrapper>
  );
}
