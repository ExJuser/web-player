import { ArrowLeft, Film, Merge, Pencil, Search, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ActorInsight } from "./actorUtils";
import type { ActorProfileStore, VideoItem } from "./playerTypes";

const pageSize = 24;

type ActorDashboardSectionProps = {
  actors: ActorInsight[];
  unresolvedVideos: VideoItem[];
  profiles: ActorProfileStore;
  selectedActorId: string | null;
  onSelectActor: (actorId: string | null) => void;
  onOpenVideo: (video: VideoItem) => void;
  onEditVideoActors: (video: VideoItem) => void;
  onRenameActor: (actorId: string, name: string) => string | null;
  onMergeActor: (sourceActorId: string, targetActorId: string) => void;
  onThumbnailError: (videoId: string) => void;
};

export function ActorDashboardSection({
  actors,
  unresolvedVideos,
  profiles,
  selectedActorId,
  onSelectActor,
  onOpenVideo,
  onEditVideoActors,
  onRenameActor,
  onMergeActor,
  onThumbnailError,
}: ActorDashboardSectionProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "count" | "recent">("count");
  const [page, setPage] = useState(1);
  const [unresolvedPage, setUnresolvedPage] = useState(1);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const selected = actors.find((entry) => entry.actor.id === selectedActorId) ?? null;
  const [actorName, setActorName] = useState(selected?.actor.name ?? "");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [managementMessage, setManagementMessage] = useState("");
  useEffect(() => {
    setActorName(selected?.actor.name ?? "");
    setMergeTargetId("");
    setManagementMessage("");
    setIsManaging(false);
  }, [selected?.actor.id, selected?.actor.name]);

  const filteredActors = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
    return actors
      .filter((entry) => !normalizedQuery || entry.actor.name.toLocaleLowerCase().includes(normalizedQuery) || entry.actor.aliases.some((alias) => alias.label.toLocaleLowerCase().includes(normalizedQuery)))
      .sort((a, b) => sort === "name"
        ? a.actor.name.localeCompare(b.actor.name, undefined, { numeric: true, sensitivity: "base" })
        : sort === "recent"
          ? b.latestModified - a.latestModified
          : b.videos.length - a.videos.length || a.actor.name.localeCompare(b.actor.name));
  }, [actors, query, sort]);
  const pageCount = Math.max(1, Math.ceil(filteredActors.length / pageSize));
  const unresolvedPageCount = Math.max(1, Math.ceil(unresolvedVideos.length / pageSize));
  useEffect(() => setPage(1), [query, sort]);
  useEffect(() => setUnresolvedPage((value) => Math.min(value, unresolvedPageCount)), [unresolvedPageCount]);
  const pagedActors = filteredActors.slice((page - 1) * pageSize, page * pageSize);
  const pagedUnresolvedVideos = unresolvedVideos.slice((unresolvedPage - 1) * pageSize, unresolvedPage * pageSize);

  if (selected) {
    return (
      <section className="actor-dashboard actor-detail" aria-label={`${selected.actor.name}演员详情`}>
        <div className="actor-dashboard-header">
          <button className="secondary-button" type="button" onClick={() => onSelectActor(null)}><ArrowLeft size={16} /> 返回演员列表</button>
          <div><h2>{selected.actor.name}</h2><p>{selected.videos.length} 部影片</p></div>
          <button className="secondary-button" type="button" onClick={() => setIsManaging((value) => !value)}><Pencil size={15} /> 管理演员</button>
        </div>
        {isManaging ? (
          <div className="actor-management-panel">
            <label><span>演员显示名</span><input value={actorName} maxLength={120} onChange={(event) => setActorName(event.target.value)} /></label>
            <button className="primary-button" type="button" disabled={!actorName.trim()} onClick={() => {
              const conflict = onRenameActor(selected.actor.id, actorName.trim());
              setManagementMessage(conflict ? "该姓名已属于其他演员，请使用合并。" : "演员姓名已更新，旧姓名继续作为别名。 ");
            }}>保存改名</button>
            <label><span>合并到</span><select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}><option value="">选择目标演员</option>{Object.values(profiles).filter((actor) => actor.id !== selected.actor.id).sort((a, b) => a.name.localeCompare(b.name)).map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
            <button className="secondary-button" type="button" disabled={!mergeTargetId} onClick={() => onMergeActor(selected.actor.id, mergeTargetId)}><Merge size={15} /> 确认合并</button>
            {managementMessage ? <div className="ai-empty-state">{managementMessage}</div> : null}
          </div>
        ) : null}
        <div className="actor-video-grid">
          {selected.videos.map(({ video, source }) => (
            <article className="actor-video-card" key={video.id}>
              <button type="button" onClick={() => onOpenVideo(video)}>
                <span className={`actor-cover ${video.thumbnailUrl ? "has-image" : ""}`}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" onError={() => onThumbnailError(video.id)} /> : <Film size={28} />}</span>
                <strong>{video.name}</strong>
              </button>
              <div><span className={`actor-source ${source}`}>{source === "manual" ? "人工" : source === "nfo" ? "NFO" : "演员标签"}</span><button className="text-button" type="button" onClick={() => onEditVideoActors(video)}>纠正演员</button></div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (showUnresolved) {
    return (
      <section className="actor-dashboard" aria-label="未识别影片">
        <div className="actor-dashboard-header"><button className="secondary-button" type="button" onClick={() => setShowUnresolved(false)}><ArrowLeft size={16} /> 返回演员列表</button><div><h2>未识别影片</h2><p>{unresolvedVideos.length} 部影片</p></div></div>
        <div className="actor-unresolved-list">{pagedUnresolvedVideos.map((video) => <div key={video.id}><span><Film size={16} /><strong>{video.name}</strong></span><button className="primary-button" type="button" onClick={() => onEditVideoActors(video)}>指定演员</button></div>)}</div>
        {unresolvedPageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={unresolvedPage <= 1} onClick={() => setUnresolvedPage((value) => value - 1)}>上一页</button><span>{unresolvedPage} / {unresolvedPageCount}</span><button className="secondary-button" type="button" disabled={unresolvedPage >= unresolvedPageCount} onClick={() => setUnresolvedPage((value) => value + 1)}>下一页</button></div> : null}
      </section>
    );
  }

  return (
    <section className="actor-dashboard" aria-label="演员视图">
      <div className="actor-dashboard-header"><div><h2>演员视图</h2><p>{actors.length} 名演员 · {unresolvedVideos.length} 部未识别影片</p></div><button className="secondary-button" type="button" onClick={() => { setUnresolvedPage(1); setShowUnresolved(true); }}><Film size={15} /> 未识别影片</button></div>
      <div className="actor-toolbar"><label><Search size={16} /><input value={query} placeholder="搜索演员姓名或别名" onChange={(event) => setQuery(event.target.value)} /></label><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="count">影片数</option><option value="name">姓名</option><option value="recent">最近影片</option></select></div>
      {pagedActors.length ? <div className="actor-card-grid">{pagedActors.map((entry) => <button className="actor-card" type="button" key={entry.actor.id} onClick={() => onSelectActor(entry.actor.id)}><span className={`actor-cover ${entry.representativeVideo.thumbnailUrl ? "has-image" : ""}`}>{entry.representativeVideo.thumbnailUrl ? <img src={entry.representativeVideo.thumbnailUrl} alt="" onError={() => onThumbnailError(entry.representativeVideo.id)} /> : <UserRound size={32} />}</span><span><strong>{entry.actor.name}</strong><small><Users size={13} /> {entry.videos.length} 部影片</small></span></button>)}</div> : <div className="ai-empty-state">没有符合条件的演员。</div>}
      {pageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>{page} / {pageCount}</span><button className="secondary-button" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>下一页</button></div> : null}
    </section>
  );
}
