type TagChipsProps = {
  tags: string[];
  actorTags?: string[];
  limit?: number;
  compact?: boolean;
};

export function TagChips({ tags, actorTags = [], limit, compact = false }: TagChipsProps) {
  const actorTagKeys = new Set(actorTags.map((tag) => tag.normalize("NFKC").trim().toLocaleLowerCase()));
  const combinedTags = [
    ...actorTags.map((tag) => ({ label: tag, isActor: true })),
    ...tags
      .filter((tag) => !actorTagKeys.has(tag.normalize("NFKC").trim().toLocaleLowerCase()))
      .map((tag) => ({ label: tag, isActor: false })),
  ];
  const visibleTags = typeof limit === "number" ? combinedTags.slice(0, limit) : combinedTags;
  if (!visibleTags.length) return null;

  return (
    <span className={`tag-chip-row ${compact ? "compact" : ""}`}>
      {visibleTags.map((tag) => (
        <span className={`tag-chip${tag.isActor ? " actor" : ""}`} key={`${tag.isActor ? "actor" : "tag"}:${tag.label}`}>
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
