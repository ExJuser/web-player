export type MosaicViewRotation = 0 | 90 | 180 | 270;
export type MosaicViewTransform = { scale: number; x: number; y: number; rotation: MosaicViewRotation };

export function calculateMosaicGeometry(input: {
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
  transform: MosaicViewTransform;
}) {
  const rotation = input.transform.rotation ?? 0;
  const quarterTurn = rotation === 90 || rotation === 270;
  const viewportAspect = input.viewportWidth / Math.max(input.viewportHeight, 1);
  const imageAspect = quarterTurn
    ? input.imageHeight / Math.max(input.imageWidth, 1)
    : input.imageWidth / Math.max(input.imageHeight, 1);
  const fittedWidth = viewportAspect > imageAspect ? input.viewportHeight * imageAspect : input.viewportWidth;
  const fittedHeight = viewportAspect > imageAspect ? input.viewportHeight : input.viewportWidth / imageAspect;
  const width = (quarterTurn ? fittedHeight : fittedWidth) * input.transform.scale;
  const height = (quarterTurn ? fittedWidth : fittedHeight) * input.transform.scale;
  const centerX = input.viewportWidth / 2 + input.transform.x;
  const centerY = input.viewportHeight / 2 + input.transform.y;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
    centerX,
    centerY,
    rotation,
  };
}

export function unrotateMosaicPoint(input: {
  pointX: number;
  pointY: number;
  geometry: ReturnType<typeof calculateMosaicGeometry>;
}) {
  const radians = input.geometry.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = input.pointX - input.geometry.centerX;
  const deltaY = input.pointY - input.geometry.centerY;
  return {
    x: input.geometry.centerX + deltaX * cosine + deltaY * sine,
    y: input.geometry.centerY - deltaX * sine + deltaY * cosine,
  };
}

export function calculateMosaicCellRect(input: {
  column: number;
  row: number;
  columns: number;
  rows: number;
  geometry: ReturnType<typeof calculateMosaicGeometry>;
}) {
  const cellWidth = input.geometry.width / input.columns;
  const cellHeight = input.geometry.height / input.rows;
  const cellCenterX = input.geometry.left + (input.column + 0.5) * cellWidth;
  const cellCenterY = input.geometry.top + (input.row + 0.5) * cellHeight;
  const radians = input.geometry.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = cellCenterX - input.geometry.centerX;
  const deltaY = cellCenterY - input.geometry.centerY;
  const rotatedCenterX = input.geometry.centerX + deltaX * cosine - deltaY * sine;
  const rotatedCenterY = input.geometry.centerY + deltaX * sine + deltaY * cosine;
  const quarterTurn = input.geometry.rotation === 90 || input.geometry.rotation === 270;
  const width = quarterTurn ? cellHeight : cellWidth;
  const height = quarterTurn ? cellWidth : cellHeight;
  return {
    left: rotatedCenterX - width / 2,
    top: rotatedCenterY - height / 2,
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
  const point = unrotateMosaicPoint(input);
  const normalizedX = (point.x - input.geometry.left) / input.geometry.width;
  const normalizedY = (point.y - input.geometry.top) / input.geometry.height;
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
