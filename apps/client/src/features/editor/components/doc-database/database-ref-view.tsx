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
  updateDocDatabase,
  type DocDatabaseInfoResponse,
} from "@/features/editor/services/doc-database-service";
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
      createdAt: Number(r.get("createdAt")) || Date.now(),
      updatedAt: Number(r.get("updatedAt")) || Date.now(),
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

function FileCell({ value, onChange, editable }: CellProps) {
  // 简化实现：作为链接处理，但显示文件图标
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
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {localValue ? (
          <>
            <IconPaperclip size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
            <a 
              href={localValue} 
              target="_blank" 
              rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()}
              style={{ color: "var(--mantine-color-text)", textDecoration: "none" }}
            >
              {localValue}
            </a>
          </>
        ) : (
          editable && <span className={styles.selectPlaceholder}>点击添加文件链接</span>
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
      placeholder="输入文件链接..."
    />
  );
}

function CreatedTimeCell({ row }: CellProps) {
  if (!row) return null;
  const date = new Date(row.createdAt);
  return (
    <div style={{ fontSize: 13, color: "var(--mantine-color-dimmed)" }}>
      {date.toLocaleString()}
    </div>
  );
}

function UpdatedTimeCell({ row }: CellProps) {
  if (!row) return null;
  const date = new Date(row.updatedAt);
  return (
    <div style={{ fontSize: 13, color: "var(--mantine-color-dimmed)" }}>
      {date.toLocaleString()}
    </div>
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
function DatabaseTitle({ title, onChange, editable }: { title: string, onChange: (val: string) => void, editable: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);

  useEffect(() => {
    setValue(title);
  }, [title]);

  return (
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
    </div>
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
            <DatabaseTitle 
              title={title} 
              onChange={handleTitleChange} 
              editable={isEditable} 
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
