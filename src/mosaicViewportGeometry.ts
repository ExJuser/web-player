export type MosaicViewTransform = { scale: number; x: number; y: number };

export function calculateMosaicGeometry(input: {
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
  transform: MosaicViewTransform;
}) {
  const viewportAspect = input.viewportWidth / Math.max(input.viewportHeight, 1);
  const imageAspect = input.imageWidth / Math.max(input.imageHeight, 1);
  const fittedWidth = viewportAspect > imageAspect ? input.viewportHeight * imageAspect : input.viewportWidth;
  const fittedHeight = viewportAspect > imageAspect ? input.viewportHeight : input.viewportWidth / imageAspect;
  const width = fittedWidth * input.transform.scale;
  const height = fittedHeight * input.transform.scale;
  return {
    left: (input.viewportWidth - width) / 2 + input.transform.x,
    top: (input.viewportHeight - height) / 2 + input.transform.y,
    width,
    height,
  };
}

export function locateMosaicCell(input: {
  pointX: number;
  pointY: number;
  columns: number;
  rows: number;
  geometry: ReturnType<typeof calculateMosaicGeometry>;
}) {
  const normalizedX = (input.pointX - input.geometry.left) / input.geometry.width;
  const normalizedY = (input.pointY - input.geometry.top) / input.geometry.height;
  if (normalizedX < 0 || normalizedX >= 1 || normalizedY < 0 || normalizedY >= 1) return null;
  const column = Math.min(input.columns - 1, Math.floor(normalizedX * input.columns));
  const row = Math.min(input.rows - 1, Math.floor(normalizedY * input.rows));
  return { column, row, index: row * input.columns + column };
}

export function calculateMosaicPopoverAnchor(input: {
  viewportWidth: number;
  viewportHeight: number;
  cellLeft: number;
  cellTop: number;
  cellWidth: number;
  cellHeight: number;
  popoverWidth: number;
  popoverHeight: number;
  gap?: number;
  padding?: number;
}) {
  const gap = input.gap ?? 12;
  const padding = input.padding ?? 12;
  const cellCenterY = input.cellTop + input.cellHeight / 2;
  const rightX = input.cellLeft + input.cellWidth + gap;
  const leftX = input.cellLeft - gap - input.popoverWidth;
  const spaceRight = input.viewportWidth - padding - rightX;
  const spaceLeft = input.cellLeft - gap - padding;
  const side = spaceRight >= input.popoverWidth || spaceRight >= spaceLeft ? "right" : "left";
  const maxX = Math.max(padding, input.viewportWidth - input.popoverWidth - padding);
  const maxY = Math.max(padding, input.viewportHeight - input.popoverHeight - padding);
  const x = Math.min(Math.max(side === "right" ? rightX : leftX, padding), maxX);
  const y = Math.min(Math.max(cellCenterY - input.popoverHeight / 2, padding), maxY);
  return {
    x,
    y,
    side,
    arrowY: Math.min(Math.max(cellCenterY - y, 22), input.popoverHeight - 22),
  } as const;
}
