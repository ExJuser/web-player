import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from "react";

import { acquireMosaicBitmap, type MosaicBitmapLease } from "./mosaicImagePipeline";
import type { MosaicRuntimeSource, MosaicTargetRotation, MosaicTileFit } from "./mosaicTypes";
import { calculateMosaicGeometry, calculateMosaicPopoverAnchor, locateMosaicCell, type MosaicViewTransform } from "./mosaicViewportGeometry";

type MosaicViewportProps = {
  assignments: string[];
  columns: number;
  rows: number;
  previewUrl: string;
  sources: MosaicRuntimeSource[];
  sourceCard?: ReactNode;
  targetColors: number[][];
  targetClarity: number;
  targetRotation: MosaicTargetRotation;
  targetUrl: string;
  colorPreservation: number;
  tileFit: MosaicTileFit;
  onSelectSource: (source: MosaicRuntimeSource | null) => void;
};

type WebGlState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  transformLocation: WebGLUniformLocation | null;
  uploadedBitmap: ImageBitmap | null;
};

function createWebGlState(canvas: HTMLCanvasElement): WebGlState | null {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
  if (!gl) return null;
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  gl.shaderSource(vertex, `#version 300 es
    in vec2 a_position;
    out vec2 v_uv;
    uniform vec4 u_transform;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position.x * u_transform.x + u_transform.z, a_position.y * u_transform.y + u_transform.w, 0.0, 1.0);
    }`);
  gl.shaderSource(fragment, `#version 300 es
    precision highp float;
    in vec2 v_uv;
    out vec4 outColor;
    uniform sampler2D u_texture;
    void main() { outColor = texture(u_texture, v_uv); }`);
  gl.compileShader(vertex);
  gl.compileShader(fragment);
  if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!buffer || !texture) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
  return { gl, program, texture, transformLocation: gl.getUniformLocation(program, "u_transform"), uploadedBitmap: null };
}

function fitScale(canvas: HTMLCanvasElement, bitmap: ImageBitmap) {
  const canvasAspect = canvas.width / Math.max(canvas.height, 1);
  const imageAspect = bitmap.width / Math.max(bitmap.height, 1);
  return canvasAspect > imageAspect
    ? { x: imageAspect / canvasAspect, y: 1 }
    : { x: 1, y: canvasAspect / imageAspect };
}

function drawDetailCover(context: CanvasRenderingContext2D, bitmap: ImageBitmap, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(bitmap, (bitmap.width - sourceWidth) / 2, (bitmap.height - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

function drawDetailContain(context: CanvasRenderingContext2D, bitmap: ImageBitmap, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.drawImage(bitmap, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawDetailTarget(context: CanvasRenderingContext2D, bitmap: ImageBitmap, x: number, y: number, width: number, height: number, rotation: MosaicTargetRotation) {
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(rotation * Math.PI / 180);
  const quarterTurn = rotation === 90 || rotation === 270;
  context.drawImage(bitmap, -(quarterTurn ? height : width) / 2, -(quarterTurn ? width : height) / 2, quarterTurn ? height : width, quarterTurn ? width : height);
  context.restore();
}

export function MosaicViewport({ assignments, columns, rows, previewUrl, sources, sourceCard, targetColors, targetClarity, targetRotation, targetUrl, colorPreservation, tileFit, onSelectSource }: MosaicViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement>(null);
  const cellHighlightRef = useRef<HTMLDivElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const targetBitmapRef = useRef<ImageBitmap | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const detailDrawRef = useRef<() => void>(() => undefined);
  const webGlRef = useRef<WebGlState | null | undefined>(undefined);
  const detailBitmapsRef = useRef(new Map<string, MosaicBitmapLease>());
  const detailPendingRef = useRef(new Set<string>());
  const detailFailedRef = useRef(new Set<string>());
  const detailGenerationRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const [transform, setTransform] = useState<MosaicViewTransform>({ scale: 1, x: 0, y: 0 });
  const [sourceAnchor, setSourceAnchor] = useState<ReturnType<typeof calculateMosaicPopoverAnchor> & { width: number; height: number; previewHeight: number } | null>(null);
  const sourceSelectionRef = useRef(0);
  const [backend, setBackend] = useState<"WebGL2" | "Canvas 2D">("WebGL2");
  const sourceById = useRef(new Map(sources.map((source) => [source.id, source])));
  sourceById.current = new Map(sources.map((source) => [source.id, source]));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    if (!canvas || !bitmap) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (webGlRef.current === undefined) {
      webGlRef.current = createWebGlState(canvas);
      if (!webGlRef.current) setBackend("Canvas 2D");
    }
    const fit = fitScale(canvas, bitmap);
    const webGl = webGlRef.current;
    if (webGl) {
      const { gl } = webGl;
      gl.viewport(0, 0, width, height);
      gl.clearColor(0.025, 0.024, 0.045, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(webGl.program);
      gl.bindTexture(gl.TEXTURE_2D, webGl.texture);
      if (webGl.uploadedBitmap !== bitmap) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        webGl.uploadedBitmap = bitmap;
      }
      gl.uniform4f(
        webGl.transformLocation,
        fit.x * transform.scale,
        fit.y * transform.scale,
        transform.x * ratio * 2 / width,
        -transform.y * ratio * 2 / height,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    const drawWidth = width * fit.x * transform.scale;
    const drawHeight = height * fit.y * transform.scale;
    context.fillStyle = "#07070d";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, (width - drawWidth) / 2 + transform.x * ratio, (height - drawHeight) / 2 + transform.y * ratio, drawWidth, drawHeight);
  }, [transform]);
  drawRef.current = draw;

  const drawDetails = useCallback(() => {
    const detailCanvas = detailCanvasRef.current;
    const baseCanvas = canvasRef.current;
    const previewBitmap = bitmapRef.current;
    if (!detailCanvas || !baseCanvas || !previewBitmap) return;
    const ratio = window.devicePixelRatio || 1;
    const viewportWidth = baseCanvas.clientWidth;
    const viewportHeight = baseCanvas.clientHeight;
    const width = Math.max(1, Math.round(viewportWidth * ratio));
    const height = Math.max(1, Math.round(viewportHeight * ratio));
    if (detailCanvas.width !== width || detailCanvas.height !== height) {
      detailCanvas.width = width;
      detailCanvas.height = height;
    }
    const context = detailCanvas.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    if (transform.scale < 3) return;
    if (targetColors.length < columns * rows) return;

    const geometry = calculateMosaicGeometry({
      viewportWidth,
      viewportHeight,
      imageWidth: previewBitmap.width,
      imageHeight: previewBitmap.height,
      transform,
    });
    const cellWidth = geometry.width / columns;
    const cellHeight = geometry.height / rows;
    const startColumn = Math.max(0, Math.floor(-geometry.left / cellWidth));
    const endColumn = Math.min(columns - 1, Math.ceil((viewportWidth - geometry.left) / cellWidth) - 1);
    const startRow = Math.max(0, Math.floor(-geometry.top / cellHeight));
    const endRow = Math.min(rows - 1, Math.ceil((viewportHeight - geometry.top) / cellHeight) - 1);
    if (startColumn > endColumn || startRow > endRow) return;

    const centerColumn = (startColumn + endColumn) / 2;
    const centerRow = (startRow + endRow) / 2;
    const visibleCells: Array<{ column: number; row: number; index: number; distance: number }> = [];
    for (let row = startRow; row <= endRow; row++) {
      for (let column = startColumn; column <= endColumn; column++) {
        visibleCells.push({
          column,
          row,
          index: row * columns + column,
          distance: (column - centerColumn) ** 2 + (row - centerRow) ** 2,
        });
      }
    }
    visibleCells.sort((left, right) => left.distance - right.distance);
    const detailCells = visibleCells.slice(0, 240);
    const generation = detailGenerationRef.current;
    let availableLoads = Math.max(0, 6 - detailPendingRef.current.size);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalAlpha = 1;
    const drawnCells: typeof detailCells = [];
    const tintOpacity = Math.max(0, Math.min(0.42, (1 - colorPreservation) * 0.42));
    detailCells.forEach((cell) => {
      const sourceId = assignments[cell.index];
      const source = sourceById.current.get(sourceId);
      if (!source) return;
      const cachedLease = detailBitmapsRef.current.get(sourceId);
      if (cachedLease) {
        detailBitmapsRef.current.delete(sourceId);
        detailBitmapsRef.current.set(sourceId, cachedLease);
        const drawTile = tileFit === "contain" ? drawDetailContain : drawDetailCover;
        const x = geometry.left + cell.column * cellWidth;
        const y = geometry.top + cell.row * cellHeight;
        drawTile(context, cachedLease.bitmap, x, y, cellWidth, cellHeight);
        if (tintOpacity > 0) {
          const color = targetColors[cell.index];
          context.save();
          context.globalCompositeOperation = "source-atop";
          context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${tintOpacity})`;
          context.fillRect(x, y, Math.ceil(cellWidth + 0.5), Math.ceil(cellHeight + 0.5));
          context.restore();
        }
        drawnCells.push(cell);
        return;
      }
      if (!availableLoads || detailPendingRef.current.has(sourceId) || detailFailedRef.current.has(sourceId)) return;
      availableLoads -= 1;
      detailPendingRef.current.add(sourceId);
      void acquireMosaicBitmap(source, 256, true).then((lease) => {
        if (detailGenerationRef.current !== generation) {
          lease.release();
          return;
        }
        detailPendingRef.current.delete(sourceId);
        detailBitmapsRef.current.set(sourceId, lease);
        while (detailBitmapsRef.current.size > 256) {
          const oldestId = detailBitmapsRef.current.keys().next().value as string | undefined;
          if (!oldestId) break;
          detailBitmapsRef.current.get(oldestId)?.release();
          detailBitmapsRef.current.delete(oldestId);
        }
        detailDrawRef.current();
      }).catch(() => {
        if (detailGenerationRef.current !== generation) return;
        detailPendingRef.current.delete(sourceId);
        detailFailedRef.current.add(sourceId);
        detailDrawRef.current();
      });
    });
    const overlayOpacity = Math.max(0, Math.min(0.28, targetClarity * 0.28));
    const targetBitmap = targetBitmapRef.current;
    if (overlayOpacity > 0 && targetBitmap && drawnCells.length) {
      const clip = new Path2D();
      drawnCells.forEach((cell) => clip.rect(geometry.left + cell.column * cellWidth, geometry.top + cell.row * cellHeight, cellWidth, cellHeight));
      context.save();
      context.clip(clip);
      context.globalAlpha = overlayOpacity;
      drawDetailTarget(context, targetBitmap, geometry.left, geometry.top, geometry.width, geometry.height, targetRotation);
      context.restore();
    }
    context.globalAlpha = 1;
  }, [assignments, colorPreservation, columns, rows, targetClarity, targetColors, targetRotation, tileFit, transform]);
  detailDrawRef.current = drawDetails;

  useEffect(() => {
    let cancelled = false;
    fetch(previewUrl)
      .then((response) => response.blob())
      .then(createImageBitmap)
      .then((bitmap) => {
        if (cancelled) return bitmap.close();
        bitmapRef.current?.close();
        bitmapRef.current = bitmap;
        drawRef.current();
        detailDrawRef.current();
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    targetBitmapRef.current?.close();
    targetBitmapRef.current = null;
    if (!targetUrl) return undefined;
    fetch(targetUrl)
      .then((response) => response.blob())
      .then(createImageBitmap)
      .then((bitmap) => {
        if (cancelled) return bitmap.close();
        targetBitmapRef.current = bitmap;
        detailDrawRef.current();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      targetBitmapRef.current?.close();
      targetBitmapRef.current = null;
    };
  }, [targetUrl]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    drawDetails();
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const observer = new ResizeObserver(drawDetails);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawDetails]);

  useEffect(() => {
    detailGenerationRef.current += 1;
    detailBitmapsRef.current.forEach((lease) => lease.release());
    detailBitmapsRef.current.clear();
    detailPendingRef.current.clear();
    detailFailedRef.current.clear();
    return () => {
      detailGenerationRef.current += 1;
      detailBitmapsRef.current.forEach((lease) => lease.release());
      detailBitmapsRef.current.clear();
    };
  }, [previewUrl]);

  useEffect(() => {
    if (cellHighlightRef.current) cellHighlightRef.current.style.opacity = "0";
    setSourceAnchor(null);
    onSelectSource(null);
  }, [onSelectSource, transform]);

  useEffect(() => () => bitmapRef.current?.close(), []);

  const updateScale = (factor: number) => setTransform((current) => ({ ...current, scale: Math.max(0.5, Math.min(16, current.scale * factor)) }));

  const locatePointerCell = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    if (!canvas || !bitmap) return null;
    const rect = canvas.getBoundingClientRect();
    const geometry = calculateMosaicGeometry({
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      imageWidth: bitmap.width,
      imageHeight: bitmap.height,
      transform,
    });
    const cell = locateMosaicCell({ pointX: clientX - rect.left, pointY: clientY - rect.top, columns, rows, geometry });
    return cell ? { ...cell, geometry } : null;
  };

  const updateCellHighlight = (clientX: number, clientY: number) => {
    const highlight = cellHighlightRef.current;
    if (!highlight) return;
    const hit = locatePointerCell(clientX, clientY);
    if (!hit) {
      highlight.style.opacity = "0";
      return;
    }
    const cellWidth = hit.geometry.width / columns;
    const cellHeight = hit.geometry.height / rows;
    highlight.style.left = `${hit.geometry.left + hit.column * cellWidth}px`;
    highlight.style.top = `${hit.geometry.top + hit.row * cellHeight}px`;
    highlight.style.width = `${cellWidth}px`;
    highlight.style.height = `${cellHeight}px`;
    highlight.style.opacity = "1";
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y, moved: false };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      updateCellHighlight(event.clientX, event.clientY);
      return;
    }
    if (cellHighlightRef.current) cellHighlightRef.current.style.opacity = "0";
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    drag.moved ||= Math.abs(deltaX) + Math.abs(deltaY) > 5;
    setTransform((current) => ({ ...current, x: drag.originX + deltaX, y: drag.originY + deltaY }));
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    const hit = locatePointerCell(event.clientX, event.clientY);
    if (!hit || hit.index >= assignments.length) return;
    updateCellHighlight(event.clientX, event.clientY);
    const source = sourceById.current.get(assignments[hit.index]);
    if (source && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const cellWidth = hit.geometry.width / columns;
      const cellHeight = hit.geometry.height / rows;
      const selection = ++sourceSelectionRef.current;
      setSourceAnchor(null);
      onSelectSource(source);
      void acquireMosaicBitmap(source, 1040, true).then((lease) => {
        const maxWidth = Math.min(1040, Math.max(1, window.innerWidth - 24));
        const maxHeight = Math.min(1020, Math.max(1, window.innerHeight - 24));
        const scale = Math.min(Math.max(1, maxWidth - 24) / lease.bitmap.width, Math.max(1, maxHeight - 140) / lease.bitmap.height);
        const previewWidth = Math.max(1, Math.round(lease.bitmap.width * scale));
        const previewHeight = Math.max(1, Math.round(lease.bitmap.height * scale));
        const popoverWidth = previewWidth + 24;
        const popoverHeight = previewHeight + 140;
        lease.release();
        if (sourceSelectionRef.current !== selection) return;
        setSourceAnchor({
          ...calculateMosaicPopoverAnchor({
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            cellLeft: rect.left + hit.geometry.left + hit.column * cellWidth,
            cellTop: rect.top + hit.geometry.top + hit.row * cellHeight,
            cellWidth,
            cellHeight,
            popoverWidth,
            popoverHeight,
          }),
          width: popoverWidth,
          height: popoverHeight,
          previewHeight,
        });
      }).catch(() => {
        if (sourceSelectionRef.current === selection) onSelectSource(null);
      });
    }
  };

  return (
    <section className="mosaic-viewport-shell">
      <canvas
        aria-label="可缩放千图成像画布"
        className="mosaic-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { if (cellHighlightRef.current) cellHighlightRef.current.style.opacity = "0"; }}
        onWheel={(event: WheelEvent<HTMLCanvasElement>) => {
          event.preventDefault();
          if (cellHighlightRef.current) cellHighlightRef.current.style.opacity = "0";
          updateScale(event.deltaY < 0 ? 1.15 : 1 / 1.15);
        }}
        ref={canvasRef}
      />
      <canvas className="mosaic-detail-layer" aria-hidden="true" ref={detailCanvasRef} />
      <div className="mosaic-cell-highlight" aria-hidden="true" ref={cellHighlightRef} />
      {sourceCard && sourceAnchor ? (
        <div
          className={`mosaic-source-popover-anchor opens-${sourceAnchor.side}`}
          style={{
            left: sourceAnchor.x,
            top: sourceAnchor.y,
            width: sourceAnchor.width,
            "--mosaic-source-arrow-y": `${sourceAnchor.arrowY}px`,
            "--mosaic-source-preview-height": `${sourceAnchor.previewHeight}px`,
          } as CSSProperties}
        >
          {sourceCard}
        </div>
      ) : null}
      <div className="mosaic-viewport-tools">
        <span>{backend}{transform.scale >= 3 ? " · 高清细节" : ""}</span>
        <button type="button" onClick={() => updateScale(1.25)} title="放大"><ZoomIn size={17} /></button>
        <button type="button" onClick={() => updateScale(0.8)} title="缩小"><ZoomOut size={17} /></button>
        <button type="button" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })} title="适应窗口"><Maximize2 size={17} /></button>
        <button type="button" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })} title="重置视角"><RotateCcw size={17} /></button>
      </div>
    </section>
  );
}
