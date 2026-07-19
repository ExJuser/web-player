import { ArrowLeft, Film, Pencil, Search, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ActorInsight } from "./actorUtils";
import { ControlSelect } from "./ControlSelect";
import type { VideoItem } from "./playerTypes";

const actorPageSize = 12;
const actorVideoPageSize = 12;
const unresolvedPageSize = 24;

type ActorDashboardSectionProps = {
  actors: ActorInsight[];
  unresolvedVideos: VideoItem[];
  selectedActorId: string | null;
  onSelectActor: (actorId: string | null) => void;
  onOpenVideo: (video: VideoItem) => void;
  onEditVideoActors: (video: VideoItem) => void;
  onThumbnailError: (videoId: string) => void;
};

export function ActorDashboardSection({
  actors,
  unresolvedVideos,
  selectedActorId,
  onSelectActor,
  onOpenVideo,
  onEditVideoActors,
  onThumbnailError,
}: ActorDashboardSectionProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "count" | "recent">("count");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [actorVideoPage, setActorVideoPage] = useState(1);
  const [unresolvedPage, setUnresolvedPage] = useState(1);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const selected = actors.find((entry) => entry.actor.id === selectedActorId) ?? null;

  const filteredActors = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
    return actors
      .filter((entry) => !normalizedQuery || entry.actor.name.toLocaleLowerCase().includes(normalizedQuery) || entry.actor.aliases.some((alias) => alias.label.toLocaleLowerCase().includes(normalizedQuery)))
      .sort((a, b) => {
        const nameComparison = a.actor.name.localeCompare(b.actor.name, undefined, { numeric: true, sensitivity: "base" });
        const direction = sortDirection === "asc" ? 1 : -1;
        if (sort === "name") return nameComparison * direction;
        if (sort === "recent") return (a.latestModified - b.latestModified) * direction || nameComparison;
        return (a.videos.length - b.videos.length) * direction || nameComparison;
      });
  }, [actors, query, sort, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(filteredActors.length / actorPageSize));
  const actorVideoPageCount = Math.max(1, Math.ceil((selected?.videos.length ?? 0) / actorVideoPageSize));
  const unresolvedPageCount = Math.max(1, Math.ceil(unresolvedVideos.length / unresolvedPageSize));
  useEffect(() => setPage(1), [query, sort, sortDirection]);
  useEffect(() => setActorVideoPage(1), [selected?.actor.id]);
  useEffect(() => setActorVideoPage((value) => Math.min(value, actorVideoPageCount)), [actorVideoPageCount]);
  useEffect(() => setUnresolvedPage((value) => Math.min(value, unresolvedPageCount)), [unresolvedPageCount]);
  const pagedActors = filteredActors.slice((page - 1) * actorPageSize, page * actorPageSize);
  const pagedActorVideos = selected?.videos.slice((actorVideoPage - 1) * actorVideoPageSize, actorVideoPage * actorVideoPageSize) ?? [];
  const pagedUnresolvedVideos = unresolvedVideos.slice((unresolvedPage - 1) * unresolvedPageSize, unresolvedPage * unresolvedPageSize);

  if (selected) {
    return (
      <section className="actor-dashboard actor-detail" aria-label={`${selected.actor.name}演员详情`}>
        <div className="actor-dashboard-header">
          <button className="secondary-button" type="button" onClick={() => onSelectActor(null)}><ArrowLeft size={16} /> 返回演员列表</button>
          <div><h2>{selected.actor.name}</h2><p>{selected.videos.length} 部影片</p></div>
        </div>
        <div className="actor-video-grid">
          {pagedActorVideos.map(({ video, source }) => (
            <article className="actor-video-card" key={video.id}>
              <button type="button" onClick={() => onOpenVideo(video)}>
                <span className={`actor-cover ${video.thumbnailUrl ? "has-image" : ""}`}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" onError={() => onThumbnailError(video.id)} /> : <Film size={28} />}</span>
                <strong>{video.name}</strong>
              </button>
              <div><span className={`actor-source ${source}`}>{source === "manual" ? "人工" : source === "nfo" ? "NFO" : "演员标签"}</span><button className="secondary-button actor-correction-button" type="button" onClick={() => onEditVideoActors(video)}><Pencil size={13} /> 纠正演员</button></div>
            </article>
          ))}
        </div>
        {actorVideoPageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={actorVideoPage <= 1} onClick={() => setActorVideoPage((value) => value - 1)}>上一页</button><span>{actorVideoPage} / {actorVideoPageCount}</span><button className="secondary-button" type="button" disabled={actorVideoPage >= actorVideoPageCount} onClick={() => setActorVideoPage((value) => value + 1)}>下一页</button></div> : null}
      </section>
    );
  }

  if (showUnresolved) {
    return (
      <section className="actor-dashboard" aria-label="未识别影片">
        <div className="actor-dashboard-header"><button className="secondary-button" type="button" onClick={() => setShowUnresolved(false)}><ArrowLeft size={16} /> 返回演员列表</button><div><h2>未识别影片</h2><p>{unresolvedVideos.length} 部影片</p></div></div>
        <div className="actor-unresolved-list">{pagedUnresolvedVideos.map((video) => <div key={video.id}><button className="actor-unresolved-video-button" type="button" onClick={() => onOpenVideo(video)} title={`播放 ${video.name}`}><Film size={16} /><strong>{video.name}</strong></button><button className="primary-button" type="button" onClick={() => onEditVideoActors(video)}>指定演员</button></div>)}</div>
        {unresolvedPageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={unresolvedPage <= 1} onClick={() => setUnresolvedPage((value) => value - 1)}>上一页</button><span>{unresolvedPage} / {unresolvedPageCount}</span><button className="secondary-button" type="button" disabled={unresolvedPage >= unresolvedPageCount} onClick={() => setUnresolvedPage((value) => value + 1)}>下一页</button></div> : null}
      </section>
    );
  }

  return (
    <section className="actor-dashboard" aria-label="演员视图">
      <div className="actor-dashboard-header"><div><h2>演员视图</h2><p>{actors.length} 名演员 · {unresolvedVideos.length} 部未识别影片</p></div><button className="secondary-button" type="button" onClick={() => { setUnresolvedPage(1); setShowUnresolved(true); }}><Film size={15} /> 未识别影片</button></div>
      <div className="actor-toolbar"><label><Search size={16} /><input value={query} placeholder="搜索演员姓名或别名" onChange={(event) => setQuery(event.target.value)} /></label><div className="actor-sort-controls"><ControlSelect label="" ariaLabel="演员排序字段" value={sort} options={[{ value: "count", label: "影片数" }, { value: "name", label: "姓名" }, { value: "recent", label: "最近影片" }]} onChange={setSort} className="actor-sort-control" /><ControlSelect label="" ariaLabel="演员排序方向" value={sortDirection} options={[{ value: "desc", label: "降序" }, { value: "asc", label: "升序" }]} onChange={setSortDirection} className="actor-sort-direction-control" /></div></div>
      {pagedActors.length ? <div className="actor-card-grid">{pagedActors.map((entry) => <button className="actor-card" type="button" key={entry.actor.id} onClick={() => { setActorVideoPage(1); onSelectActor(entry.actor.id); }}><span className={`actor-cover ${entry.representativeVideo.thumbnailUrl ? "has-image" : ""}`}>{entry.representativeVideo.thumbnailUrl ? <img src={entry.representativeVideo.thumbnailUrl} alt="" onError={() => onThumbnailError(entry.representativeVideo.id)} /> : <UserRound size={32} />}</span><span><strong>{entry.actor.name}</strong><small><Users size={13} /> {entry.videos.length} 部影片</small></span></button>)}</div> : <div className="ai-empty-state">没有符合条件的演员。</div>}
      {pageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>{page} / {pageCount}</span><button className="secondary-button" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>下一页</button></div> : null}
    </section>
  );
}
