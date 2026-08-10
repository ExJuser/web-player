type TagChipsProps = {
  tags: string[];
  actorTags?: string[];
  systemTags?: string[];
  limit?: number;
  compact?: boolean;
  userTagsFirst?: boolean;
};

export function TagChips({ tags, actorTags = [], systemTags = [], limit, compact = false, userTagsFirst = false }: TagChipsProps) {
  const systemTagKeys = new Set(systemTags.map((tag) => tag.normalize("NFKC").trim().toLocaleLowerCase()));
  const actorTagKeys = new Set(actorTags.map((tag) => tag.normalize("NFKC").trim().toLocaleLowerCase()));
  const systemTagItems = systemTags.map((tag) => ({ label: tag, kind: "system" as const }));
  const actorTagItems = actorTags
    .filter((tag) => !systemTagKeys.has(tag.normalize("NFKC").trim().toLocaleLowerCase()))
    .map((tag) => ({ label: tag, kind: "actor" as const }));
  const userTagItems = tags
    .filter((tag) => {
      const key = tag.normalize("NFKC").trim().toLocaleLowerCase();
      return !actorTagKeys.has(key) && !systemTagKeys.has(key);
    })
    .map((tag) => ({ label: tag, kind: "tag" as const }));
  const combinedTags = userTagsFirst
    ? [...userTagItems, ...actorTagItems, ...systemTagItems]
    : [
        ...systemTagItems,
        ...actorTagItems,
        ...userTagItems,
      ];
  const visibleTags = typeof limit === "number" ? combinedTags.slice(0, limit) : combinedTags;
  if (!visibleTags.length) return null;

  return (
    <span className={`tag-chip-row ${compact ? "compact" : ""}`} title={combinedTags.map((tag) => tag.label).join(" · ")}>
      {visibleTags.map((tag) => (
        <span className={`tag-chip${tag.kind === "actor" ? " actor" : tag.kind === "system" ? " system" : ""}`} key={`${tag.kind}:${tag.label}`}>
          {tag.label}
        </span>
      ))}
      {combinedTags.length > visibleTags.length ? <span className="tag-chip more">+{combinedTags.length - visibleTags.length}</span> : null}
    </span>
  );
}

type RatingChipProps = {
  rating?: number;
  comment?: string;
};

export function RatingChip({ rating, comment }: RatingChipProps) {
  const trimmedComment = comment?.trim();
  if (typeof rating !== "number" && !trimmedComment) return null;

  const ratingLabel = typeof rating === "number" ? `评分 ${rating}/10` : "评价";
  return <span className="rating-chip">{trimmedComment ? `${ratingLabel} · ${trimmedComment}` : ratingLabel}</span>;
}
