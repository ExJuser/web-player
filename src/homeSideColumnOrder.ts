/**
 * 首页侧边条卡片排序记忆。
 *
 * 卡片 key 是稳定的身份标识（与数据持久化规则一致：不用 label 这类可重复的显示文本做身份），
 * 用户拖拽或键盘调整后的顺序以 key 数组形式存于 localStorage，跨模式共享：
 * 条件卡片（如“无剧透回顾”仅在追番模式出现）在 order 中保留位置，出现时按其顺序插入。
 */

export const HOME_SIDE_CARD_KEYS = [
  "mode",
  "mediaLibrary",
  "cacheStatus",
  "recentAdds",
  "recap",
  "tagStats",
  "duplicate",
  "videoVersions",
] as const;

export type HomeSideCardKey = (typeof HOME_SIDE_CARD_KEYS)[number];

export const defaultHomeSideColumnOrder: readonly HomeSideCardKey[] = HOME_SIDE_CARD_KEYS;

const HOME_SIDE_COLUMN_ORDER_KEY = "homeSideColumnOrder";

/** 容错规范化：丢弃未知 key、去重、把缺失的卡片按默认顺序追加到末尾。 */
export function normalizeHomeSideColumnOrder(value: unknown): HomeSideCardKey[] {
  if (!Array.isArray(value)) return [...defaultHomeSideColumnOrder];

  const knownKeys = new Set<string>(HOME_SIDE_CARD_KEYS);
  const seen = new Set<HomeSideCardKey>();
  const order: HomeSideCardKey[] = [];

  for (const item of value) {
    if (typeof item === "string" && knownKeys.has(item) && !seen.has(item as HomeSideCardKey)) {
      seen.add(item as HomeSideCardKey);
      order.push(item as HomeSideCardKey);
    }
  }
  for (const key of HOME_SIDE_CARD_KEYS) {
    if (!seen.has(key)) order.push(key);
  }
  return order;
}

export function loadHomeSideColumnOrder(): HomeSideCardKey[] {
  try {
    const raw = window.localStorage.getItem(HOME_SIDE_COLUMN_ORDER_KEY);
    if (!raw) return [...defaultHomeSideColumnOrder];
    return normalizeHomeSideColumnOrder(JSON.parse(raw));
  } catch {
    return [...defaultHomeSideColumnOrder];
  }
}

export function saveHomeSideColumnOrder(order: HomeSideCardKey[]): void {
  try {
    window.localStorage.setItem(HOME_SIDE_COLUMN_ORDER_KEY, JSON.stringify(order));
  } catch {
    // 隐私模式或存储被禁时静默失败，仅本次会话内有效。
  }
}
