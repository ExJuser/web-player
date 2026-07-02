type TagChipsProps = {
  tags: string[];
  limit?: number;
  compact?: boolean;
};

export function TagChips({ tags, limit, compact = false }: TagChipsProps) {
  const visibleTags = typeof limit === "number" ? tags.slice(0, limit) : tags;
  if (!visibleTags.length) return null;

  return (
    <span className={`tag-chip-row ${compact ? "compact" : ""}`}>
      {visibleTags.map((tag) => (
        <span className="tag-chip" key={tag}>
          {tag}
        </span>
      ))}
      {tags.length > visibleTags.length ? <span className="tag-chip more">+{tags.length - visibleTags.length}</span> : null}
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
