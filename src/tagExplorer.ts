import { normalizeTagKey } from "./tagUtils";

export type TagExplorerCriterion = {
  key: string;
  label: string;
};

export type TagExplorerSelection = {
  included: TagExplorerCriterion[];
  excluded: TagExplorerCriterion[];
};

export function matchesTagExplorerSelection(tags: string[], selection: TagExplorerSelection) {
  const tagKeys = new Set(tags.map(normalizeTagKey).filter(Boolean));
  return selection.included.every((tag) => tagKeys.has(tag.key))
    && selection.excluded.every((tag) => !tagKeys.has(tag.key));
}

export function formatTagExplorerSearchQuery(selection: TagExplorerSelection) {
  return [
    ...selection.included.map((tag) => tag.label),
    ...selection.excluded.map((tag) => `-${tag.label}`),
  ].join(" ");
}
