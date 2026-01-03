/**
 * Database Grid Constants & Types
 * 轻量 Notion Database 实现
 */

// ============================================================
// Grid Size Constants
// ============================================================
export const GridSize = {
  /** 表头高度 */
  headerHeight: 36,
  /** 单元格水平内边距 */
  cellHPadding: 10,
  /** 单元格垂直内边距 */
  cellVPadding: 8,
  /** 最小列宽 */
  minColumnWidth: 80,
  /** 默认列宽 */
  defaultColumnWidth: 150,
  /** 添加列按钮宽度 */
  newColumnBtnWidth: 80,
  /** 行操作区域宽度 */
  rowActionsWidth: 52,
  /** 添加行按钮高度 */
  addRowBtnHeight: 36,
} as const;

// ============================================================
// Field Types (字段类型)
// ============================================================
export type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multiSelect"
  | "checkbox";

export const FIELD_TYPE_OPTIONS: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "文本" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "select", label: "单选" },
  { value: "multiSelect", label: "多选" },
  { value: "checkbox", label: "复选" },
];

// ============================================================
// Select Option (单选/多选选项)
// ============================================================
export interface SelectOption {
  id: string;
  label: string;
  color: string;
}

/**
 * 预设选项颜色 (8 种)
 */
export const OPTION_COLORS = [
  "#FF6B6B", // 红色
  "#FFA94D", // 橙色
  "#FFD43B", // 黄色
  "#69DB7C", // 绿色
  "#4DABF7", // 蓝色
  "#9775FA", // 紫色
  "#F783AC", // 粉色
  "#868E96", // 灰色
] as const;

export function getRandomOptionColor(): string {
  return OPTION_COLORS[Math.floor(Math.random() * OPTION_COLORS.length)];
}
