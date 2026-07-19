import { RotateCcw, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ActorProfileStore, ActorSource, VideoItem } from "./playerTypes";

type ActorEditDialogProps = {
  video: VideoItem | null;
  source: ActorSource | null;
  profiles: ActorProfileStore;
  initialActorIds: string[];
  isManual: boolean;
  onClose: () => void;
  onSave: (actorIds: string[], newActorName?: string) => void;
  onRestoreAutomatic: () => void;
};

export function ActorEditDialog({
  video,
  source,
  profiles,
  initialActorIds,
  isManual,
  onClose,
  onSave,
  onRestoreAutomatic,
}: ActorEditDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialActorIds));
  const [newActorName, setNewActorName] = useState("");
  useEffect(() => {
    setSelectedIds(new Set(initialActorIds));
    setNewActorName("");
  }, [initialActorIds, video?.id]);
  const actors = useMemo(
    () => Object.values(profiles).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
    [profiles],
  );
  const selectedActors = actors.filter((actor) => selectedIds.has(actor.id));
  const otherActors = actors.filter((actor) => !selectedIds.has(actor.id));
  const normalizedActorQuery = newActorName.normalize("NFKC").trim().toLocaleLowerCase();
  const matchingActors = normalizedActorQuery
    ? actors.filter((actor) => [actor.name, ...actor.aliases.map((alias) => alias.label)].some((name) => name.normalize("NFKC").toLocaleLowerCase().includes(normalizedActorQuery)))
    : actors;
  const filteredOtherActors = matchingActors.filter((actor) => !selectedIds.has(actor.id));
  const matchingSelectedActorCount = matchingActors.length - filteredOtherActors.length;
  const toggleActor = (actorId: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(actorId)) next.delete(actorId); else next.add(actorId);
    return next;
  });
  if (!video) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="actor-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="actor-edit-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        <div className="dialog-copy">
          <h2 id="actor-edit-title">纠正影片演员</h2>
          <p>{video.name} · 当前来源：{source === "manual" ? "人工" : source === "nfo" ? "NFO" : source === "tag" ? "演员标签" : "未识别"}</p>
        </div>
        <div className="actor-selected-section">
          <strong className="actor-edit-section-title">已选演员（{selectedActors.length}）</strong>
          {selectedActors.length ? (
            <div className="actor-selected-list custom-scrollbar">
              {selectedActors.map((actor) => (
                <label key={actor.id}>
                  <input type="checkbox" checked onChange={() => toggleActor(actor.id)} />
                  <span>{actor.name}</span>
                </label>
              ))}
            </div>
          ) : <div className="actor-selected-empty">暂未选择演员</div>}
        </div>
        <strong className="actor-edit-section-title">{normalizedActorQuery ? `筛选结果（${filteredOtherActors.length} / ${otherActors.length}）` : `其他演员（${otherActors.length}）`}</strong>
        <div className="actor-checkbox-list custom-scrollbar">
          {filteredOtherActors.map((actor) => (
            <label key={actor.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(actor.id)}
                onChange={() => {
                  toggleActor(actor.id);
                  setNewActorName("");
                }}
              />
              <span>{actor.name}</span>
            </label>
          ))}
          {!filteredOtherActors.length ? <div className="ai-empty-state">{normalizedActorQuery ? matchingSelectedActorCount ? "匹配演员已在“已选演员”中。" : "没有匹配演员，保存时将新增该演员。" : actors.length ? "没有其他演员。" : "尚无演员，可在下方新增。"}</div> : null}
        </div>
        <label className="actor-new-field">
          <span>搜索或新增演员</span>
          <input value={newActorName} maxLength={120} placeholder="筛选现有演员，或输入新姓名" onChange={(event) => setNewActorName(event.target.value)} />
          <small>存在匹配项时可直接在上方勾选。</small>
        </label>
        <div className="dialog-actions">
          <button className="primary-button" type="button" onClick={() => onSave(Array.from(selectedIds), newActorName.trim() || undefined)}>
            <UserPlus size={16} /> 保存人工名单
          </button>
          {isManual ? (
            <button className="secondary-button" type="button" onClick={onRestoreAutomatic}>
              <RotateCcw size={16} /> 恢复自动识别
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
        </div>
      </section>
    </div>
  );
}
