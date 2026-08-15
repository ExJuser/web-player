import type { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { GripVertical } from "lucide-react";

import { DuplicateVideoSummaryCard } from "./DuplicateVideoSummaryCard";
import { HomeMediaLibraryCard } from "./HomeMediaLibraryCard";
import { HomeModeCard } from "./HomeModeCard";
import { HomeRecapCard } from "./HomeRecapCard";
import { HomeTagStats } from "./HomeTagStats";
import { VideoVersionSummaryCard } from "./VideoVersionSummaryCard";
import {
  type HomeSideCardKey,
  loadHomeSideColumnOrder,
  saveHomeSideColumnOrder,
} from "./homeSideColumnOrder";

type HomeSideColumnProps = {
  duplicateSummary: ComponentProps<typeof DuplicateVideoSummaryCard> | null;
  mediaLibrary: ComponentProps<typeof HomeMediaLibraryCard>;
  mode: ComponentProps<typeof HomeModeCard>;
  recap: ComponentProps<typeof HomeRecapCard> | null;
  tagStats: ComponentProps<typeof HomeTagStats> | null;
  videoVersions: ComponentProps<typeof VideoVersionSummaryCard> | null;
};

type SideCardEntry = {
  key: HomeSideCardKey;
  label: string;
  node: ReactNode;
};

type DragState = {
  key: HomeSideCardKey;
  pointerId: number;
  offsetY: number;
  left: number;
  top: number;
  width: number;
};

export function HomeSideColumn({
  duplicateSummary,
  mediaLibrary,
  mode,
  recap,
  tagStats,
  videoVersions,
}: HomeSideColumnProps) {
  // 排序记忆：初始化读 localStorage，拖拽/键盘调整后实时写回。
  const [order, setOrder] = useState<HomeSideCardKey[]>(() => loadHomeSideColumnOrder());
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const cardRefs = useRef(new Map<HomeSideCardKey, HTMLDivElement>());

  const entries: SideCardEntry[] = [];
  entries.push({ key: "mode", label: "媒体模式", node: <HomeModeCard {...mode} /> });
  entries.push({ key: "mediaLibrary", label: "媒体库", node: <HomeMediaLibraryCard {...mediaLibrary} /> });
  if (recap) entries.push({ key: "recap", label: "无剧透回顾", node: <HomeRecapCard {...recap} /> });
  if (tagStats) entries.push({ key: "tagStats", label: "标签统计", node: <HomeTagStats {...tagStats} /> });
  if (duplicateSummary) {
    entries.push({ key: "duplicate", label: "重复视频", node: <DuplicateVideoSummaryCard {...duplicateSummary} /> });
  }
  if (videoVersions) {
    entries.push({ key: "videoVersions", label: "剪辑 / 修复版本", node: <VideoVersionSummaryCard {...videoVersions} /> });
  }

  // 按记忆顺序排列当前可见卡片；order 之外的（理论不会发生）追加到末尾兜底。
  const orderedEntries: SideCardEntry[] = [];
  const entriesByKey = new Map<HomeSideCardKey, SideCardEntry>();
  entries.forEach((entry) => entriesByKey.set(entry.key, entry));
  order.forEach((key) => {
    const entry = entriesByKey.get(key);
    if (entry) {
      orderedEntries.push(entry);
      entriesByKey.delete(key);
    }
  });
  entriesByKey.forEach((entry) => orderedEntries.push(entry));

  const commitOrder = useCallback((next: HomeSideCardKey[]) => {
    setOrder(next);
    saveHomeSideColumnOrder(next);
  }, []);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>, key: HomeSideCardKey) => {
    if (dragRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const el = cardRefs.current.get(key);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const state: DragState = {
      key,
      pointerId: event.pointerId,
      offsetY: event.clientY - rect.top,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
    dragRef.current = state;
    setDrag(state);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state || event.pointerId !== state.pointerId) return;

    // 依据指针纵向位置计算插入索引：逐卡比较中线，指针越过某卡中线则插到其后。
    const prevOrder = orderRef.current;
    const rest = prevOrder.filter((key) => key !== state.key);
    let insertIndex = 0;
    for (const key of rest) {
      const el = cardRefs.current.get(key);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) insertIndex += 1;
      else break;
    }
    const next = [...rest.slice(0, insertIndex), state.key, ...rest.slice(insertIndex)];
    if (next.join(",") !== prevOrder.join(",")) commitOrder(next);

    setDrag((prev) =>
      prev && prev.pointerId === state.pointerId
        ? { ...prev, top: event.clientY - prev.offsetY }
        : prev,
    );
  }, [commitOrder]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针已丢失捕获时忽略。
    }
  }, []);

  const moveCardByKey = useCallback((key: HomeSideCardKey, direction: -1 | 1) => {
    const prevOrder = orderRef.current;
    const index = prevOrder.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= prevOrder.length) return;
    const next = [...prevOrder];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    commitOrder(next);
  }, [commitOrder]);

  const dragEntry = drag ? entriesByKey.get(drag.key) : null;

  return (
    <aside className="home-side-column" aria-label="首页辅助信息">
      {orderedEntries.map((entry) => (
        <div
          key={entry.key}
          ref={(el) => {
            if (el) cardRefs.current.set(entry.key, el);
            else cardRefs.current.delete(entry.key);
          }}
          className={`home-side-card${drag?.key === entry.key ? " is-dragging" : ""}`}
          data-card-key={entry.key}
        >
          <button
            className="home-side-card-drag-handle"
            type="button"
            aria-label={`拖动排序“${entry.label}”卡片（按住手柄拖动，或按上下方向键移动）`}
            title={`拖动排序“${entry.label}”，或按上下方向键移动`}
            onPointerDown={(event) => startDrag(event, entry.key)}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveCardByKey(entry.key, -1);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                moveCardByKey(entry.key, 1);
              }
            }}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
          {entry.node}
        </div>
      ))}

      {drag && dragEntry ? (
        <div
          className="home-side-drag-ghost"
          aria-hidden="true"
          style={{ top: drag.top, left: drag.left, width: drag.width }}
        >
          {dragEntry.node}
        </div>
      ) : null}
    </aside>
  );
}
