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
  | "checkbox"
  | "url"
  | "file"
  | "page"
  | "createdTime"
  | "updatedTime";

export const FIELD_TYPE_OPTIONS: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "文本" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "select", label: "单选" },
  { value: "multiSelect", label: "多选" },
  { value: "checkbox", label: "复选" },
  { value: "url", label: "链接" },
  { value: "file", label: "文件" },
  { value: "page", label: "页面" },
  { value: "createdTime", label: "创建时间" },
  { value: "updatedTime", label: "修改时间" },
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

// ============================================================
// Filter Types (筛选类型)
// ============================================================
export type FilterOperator =
  | "contains"      // 包含
  | "notContains"   // 不包含
  | "equals"        // 等于
  | "notEquals"     // 不等于
  | "isEmpty"       // 为空
  | "isNotEmpty"    // 不为空
  | "greaterThan"   // 大于
  | "lessThan"      // 小于
  | "isChecked"     // 已勾选
  | "isUnchecked";  // 未勾选

export interface FilterCondition {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterOperatorOption {
  value: FilterOperator;
  label: string;
  needsValue: boolean; // 是否需要输入值
}

// 根据字段类型获取可用的操作符
export function getOperatorsForFieldType(fieldType: FieldType): FilterOperatorOption[] {
  const textOperators: FilterOperatorOption[] = [
    { value: "contains", label: "包含", needsValue: true },
    { value: "notContains", label: "不包含", needsValue: true },
    { value: "equals", label: "等于", needsValue: true },
    { value: "notEquals", label: "不等于", needsValue: true },
    { value: "isEmpty", label: "为空", needsValue: false },
    { value: "isNotEmpty", label: "不为空", needsValue: false },
  ];

  const numberOperators: FilterOperatorOption[] = [
    { value: "equals", label: "等于", needsValue: true },
    { value: "notEquals", label: "不等于", needsValue: true },
    { value: "greaterThan", label: "大于", needsValue: true },
    { value: "lessThan", label: "小于", needsValue: true },
    { value: "isEmpty", label: "为空", needsValue: false },
    { value: "isNotEmpty", label: "不为空", needsValue: false },
  ];

  const dateOperators: FilterOperatorOption[] = [
    { value: "equals", label: "等于", needsValue: true },
    { value: "greaterThan", label: "晚于", needsValue: true },
    { value: "lessThan", label: "早于", needsValue: true },
    { value: "isEmpty", label: "为空", needsValue: false },
    { value: "isNotEmpty", label: "不为空", needsValue: false },
  ];

  const checkboxOperators: FilterOperatorOption[] = [
    { value: "isChecked", label: "已勾选", needsValue: false },
    { value: "isUnchecked", label: "未勾选", needsValue: false },
  ];

  const selectOperators: FilterOperatorOption[] = [
    { value: "equals", label: "等于", needsValue: true },
    { value: "notEquals", label: "不等于", needsValue: true },
    { value: "isEmpty", label: "为空", needsValue: false },
    { value: "isNotEmpty", label: "不为空", needsValue: false },
  ];

  switch (fieldType) {
    case "text":
    case "url":
    case "file":
    case "page":
      return textOperators;
    case "number":
      return numberOperators;
    case "date":
    case "createdTime":
    case "updatedTime":
      return dateOperators;
    case "checkbox":
      return checkboxOperators;
    case "select":
    case "multiSelect":
      return selectOperators;
    default:
      return textOperators;
  }
}

// ============================================================
// Sort Types (排序类型)
// ============================================================
export type SortDirection = "asc" | "desc";

export interface SortCondition {
  id: string;
  columnId: string;
  direction: SortDirection;
}

export const SORT_DIRECTIONS: Array<{ value: SortDirection; label: string }> = [
  { value: "asc", label: "升序" },
  { value: "desc", label: "降序" },
];
