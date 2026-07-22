import { Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from "react";

import { acquireMosaicBitmap, type MosaicBitmapLease } from "./mosaicImagePipeline";
import type { MosaicRuntimeSource, MosaicTileFit } from "./mosaicTypes";
import { calculateMosaicCellRect, calculateMosaicGeometry, calculateMosaicPopoverAnchor, locateMosaicCell, unrotateMosaicPoint, type MosaicViewRotation, type MosaicViewTransform } from "./mosaicViewportGeometry";

type MosaicViewportProps = {
  assignments: string[];
  columns: number;
  rows: number;
  previewUrl: string;
  sources: MosaicRuntimeSource[];
  sourceCard?: ReactNode;
  tileFit: MosaicTileFit;
  onSelectSource: (source: MosaicRuntimeSource | null) => void;
};

type WebGlState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  transformLocation: WebGLUniformLocation | null;
  rotationLocation: WebGLUniformLocation | null;
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
    uniform float u_rotation;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      vec2 scaled = vec2(a_position.x * u_transform.x, a_position.y * u_transform.y);
      float cosine = cos(u_rotation);
      float sine = sin(u_rotation);
      vec2 rotated = vec2(scaled.x * cosine - scaled.y * sine, scaled.x * sine + scaled.y * cosine);
      gl_Position = vec4(rotated + u_transform.zw, 0.0, 1.0);
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
  return {
    gl,
    program,
    texture,
    transformLocation: gl.getUniformLocation(program, "u_transform"),
    rotationLocation: gl.getUniformLocation(program, "u_rotation"),
    uploadedBitmap: null,
  };
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

export function MosaicViewport({ assignments, columns, rows, previewUrl, sources, sourceCard, tileFit, onSelectSource }: MosaicViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement>(null);
  const cellHighlightRef = useRef<HTMLDivElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const detailDrawRef = useRef<() => void>(() => undefined);
  const webGlRef = useRef<WebGlState | null | undefined>(undefined);
  const detailBitmapsRef = useRef(new Map<string, MosaicBitmapLease>());
  const detailPendingRef = useRef(new Set<string>());
  const detailFailedRef = useRef(new Set<string>());
  const detailGenerationRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const [transform, setTransform] = useState<MosaicViewTransform>({ scale: 1, x: 0, y: 0, rotation: 0 });
  const [sourceAnchor, setSourceAnchor] = useState<ReturnType<typeof calculateMosaicPopoverAnchor> & { width: number; height: number } | null>(null);
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
    const geometry = calculateMosaicGeometry({
      viewportWidth: canvas.clientWidth,
      viewportHeight: canvas.clientHeight,
      imageWidth: bitmap.width,
      imageHeight: bitmap.height,
      transform,
    });
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
        geometry.width / Math.max(canvas.clientWidth, 1),
        geometry.height / Math.max(canvas.clientHeight, 1),
        transform.x * ratio * 2 / width,
        -transform.y * ratio * 2 / height,
      );
      gl.uniform1f(webGl.rotationLocation, -transform.rotation * Math.PI / 180);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#07070d";
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(geometry.centerX * ratio, geometry.centerY * ratio);
    context.rotate(transform.rotation * Math.PI / 180);
    context.drawImage(bitmap, -geometry.width * ratio / 2, -geometry.height * ratio / 2, geometry.width * ratio, geometry.height * ratio);
    context.restore();
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

    const geometry = calculateMosaicGeometry({
      viewportWidth,
      viewportHeight,
      imageWidth: previewBitmap.width,
      imageHeight: previewBitmap.height,
      transform,
    });
    const cellWidth = geometry.width / columns;
    const cellHeight = geometry.height / rows;
    const viewportCorners = [
      { pointX: 0, pointY: 0 },
      { pointX: viewportWidth, pointY: 0 },
      { pointX: 0, pointY: viewportHeight },
      { pointX: viewportWidth, pointY: viewportHeight },
    ].map((point) => unrotateMosaicPoint({ ...point, geometry }));
    const visibleLeft = Math.min(...viewportCorners.map((point) => point.x));
    const visibleRight = Math.max(...viewportCorners.map((point) => point.x));
    const visibleTop = Math.min(...viewportCorners.map((point) => point.y));
    const visibleBottom = Math.max(...viewportCorners.map((point) => point.y));
    const startColumn = Math.max(0, Math.floor((visibleLeft - geometry.left) / cellWidth));
    const endColumn = Math.min(columns - 1, Math.ceil((visibleRight - geometry.left) / cellWidth) - 1);
    const startRow = Math.max(0, Math.floor((visibleTop - geometry.top) / cellHeight));
    const endRow = Math.min(rows - 1, Math.ceil((visibleBottom - geometry.top) / cellHeight) - 1);
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
    context.save();
    context.translate(geometry.centerX, geometry.centerY);
    context.rotate(transform.rotation * Math.PI / 180);
    context.translate(-geometry.centerX, -geometry.centerY);
    context.globalAlpha = 0.9;
    detailCells.forEach((cell) => {
      const sourceId = assignments[cell.index];
      const source = sourceById.current.get(sourceId);
      if (!source) return;
      const cachedLease = detailBitmapsRef.current.get(sourceId);
      if (cachedLease) {
        detailBitmapsRef.current.delete(sourceId);
        detailBitmapsRef.current.set(sourceId, cachedLease);
        const drawTile = tileFit === "contain" ? drawDetailContain : drawDetailCover;
        drawTile(context, cachedLease.bitmap, geometry.left + cell.column * cellWidth, geometry.top + cell.row * cellHeight, cellWidth, cellHeight);
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
    context.globalAlpha = 1;
    context.restore();
  }, [assignments, columns, rows, tileFit, transform]);
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
  const rotateView = () => setTransform((current) => ({
    scale: 1,
    x: 0,
    y: 0,
    rotation: ((current.rotation + 90) % 360) as MosaicViewRotation,
  }));

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
    const cellRect = calculateMosaicCellRect({ column: hit.column, row: hit.row, columns, rows, geometry: hit.geometry });
    highlight.style.left = `${cellRect.left}px`;
    highlight.style.top = `${cellRect.top}px`;
    highlight.style.width = `${cellRect.width}px`;
    highlight.style.height = `${cellRect.height}px`;
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
      const cellRect = calculateMosaicCellRect({ column: hit.column, row: hit.row, columns, rows, geometry: hit.geometry });
      const popoverWidth = Math.min(520, Math.max(1, rect.width - 24), Math.max(420, rect.width * 0.46));
      const popoverHeight = Math.min(510, Math.max(1, rect.height - 24));
      setSourceAnchor({
        ...calculateMosaicPopoverAnchor({
          viewportWidth: rect.width,
          viewportHeight: rect.height,
          cellLeft: cellRect.left,
          cellTop: cellRect.top,
          cellWidth: cellRect.width,
          cellHeight: cellRect.height,
          popoverWidth,
          popoverHeight,
        }),
        width: popoverWidth,
        height: popoverHeight,
      });
      onSelectSource(source);
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
            "--mosaic-source-preview-height": `${Math.max(160, sourceAnchor.height - 140)}px`,
          } as CSSProperties}
        >
          {sourceCard}
        </div>
      ) : null}
      <div className="mosaic-viewport-tools">
        <span>{backend}{transform.scale >= 3 ? " · 高清细节" : ""}</span>
        <button type="button" onClick={() => updateScale(1.25)} title="放大"><ZoomIn size={17} /></button>
        <button type="button" onClick={() => updateScale(0.8)} title="缩小"><ZoomOut size={17} /></button>
        <button type="button" onClick={() => setTransform((current) => ({ ...current, scale: 1, x: 0, y: 0 }))} title="适应窗口"><Maximize2 size={17} /></button>
        <button type="button" onClick={rotateView} title="顺时针旋转作品"><RotateCw size={17} /></button>
        <button type="button" onClick={() => setTransform({ scale: 1, x: 0, y: 0, rotation: 0 })} title="重置视角"><RotateCcw size={17} /></button>
      </div>
    </section>
  );
}
