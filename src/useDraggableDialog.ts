import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type DialogOffset = {
  x: number;
  y: number;
};

type DialogDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export function useDraggableDialog(isOpen: boolean) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DialogDragState | null>(null);
  const [offset, setOffset] = useState<DialogOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const clampOffset = useCallback((nextOffset: DialogOffset) => {
    const dialog = dialogRef.current;
    if (!dialog) return nextOffset;

    const rect = dialog.getBoundingClientRect();
    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const maxX = Math.max(0, viewportWidth / 2 - halfWidth - margin);
    const minX = Math.min(0, -viewportWidth / 2 + halfWidth + margin);
    const maxY = Math.max(0, viewportHeight / 2 - halfHeight - margin);
    const minY = Math.min(0, -viewportHeight / 2 + halfHeight + margin);

    return {
      x: Math.min(maxX, Math.max(minX, nextOffset.x)),
      y: Math.min(maxY, Math.max(minY, nextOffset.y)),
    };
  }, []);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [offset]);

  const moveDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setOffset(clampOffset({
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    }));
  }, [clampOffset]);

  const stopDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    dragRef.current = null;
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, [isOpen]);

  return {
    dialogRef,
    isDragging,
    moveDrag,
    offset,
    startDrag,
    stopDrag,
  };
}
