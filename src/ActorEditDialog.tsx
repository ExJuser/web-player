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
  if (!video) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="actor-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="actor-edit-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        <div className="dialog-copy">
          <h2 id="actor-edit-title">纠正影片演员</h2>
          <p>{video.name} · 当前来源：{source === "manual" ? "人工" : source === "nfo" ? "NFO" : source === "tag" ? "演员标签" : "未识别"}</p>
        </div>
        <div className="actor-checkbox-list custom-scrollbar">
          {actors.map((actor) => (
            <label key={actor.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(actor.id)}
                onChange={() => setSelectedIds((current) => {
                  const next = new Set(current);
                  if (next.has(actor.id)) next.delete(actor.id); else next.add(actor.id);
                  return next;
                })}
              />
              <span>{actor.name}</span>
            </label>
          ))}
          {!actors.length ? <div className="ai-empty-state">尚无演员，可在下方新增。</div> : null}
        </div>
        <label className="actor-new-field">
          <span>新增演员</span>
          <input value={newActorName} maxLength={120} placeholder="输入演员姓名" onChange={(event) => setNewActorName(event.target.value)} />
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
