export const PAGE_PROPERTY_KEYS = [
  'tags',
  'owner',
  'status',
  'priority',
  'dueAt',
] as const;

export type PagePropertyKey = (typeof PAGE_PROPERTY_KEYS)[number];

export const DEFAULT_PAGE_STATUS_OPTIONS = [
  'Backlog',
  'Todo',
  'In Progress',
  'Done',
] as const;

export const DEFAULT_ENABLED_PAGE_PROPERTIES: PagePropertyKey[] = [
  ...PAGE_PROPERTY_KEYS,
];

export const PAGE_PROPERTY_FIELD_TO_KEY = {
  ownerId: 'owner',
  status: 'status',
  priority: 'priority',
  dueAt: 'dueAt',
  tags: 'tags',
} as const satisfies Record<string, PagePropertyKey>;
