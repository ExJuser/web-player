import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";

import type { MosaicRuntimeSource } from "./mosaicTypes";

type MosaicViewportProps = {
  assignments: string[];
  columns: number;
  rows: number;
  previewUrl: string;
  sources: MosaicRuntimeSource[];
  onSelectSource: (source: MosaicRuntimeSource) => void;
};

type ViewTransform = { scale: number; x: number; y: number };
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

export function MosaicViewport({ assignments, columns, rows, previewUrl, sources, onSelectSource }: MosaicViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const webGlRef = useRef<WebGlState | null | undefined>(undefined);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, x: 0, y: 0 });
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

  useEffect(() => () => bitmapRef.current?.close(), []);

  const updateScale = (factor: number) => setTransform((current) => ({ ...current, scale: Math.max(0.5, Math.min(16, current.scale * factor)) }));

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y, moved: false };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    drag.moved ||= Math.abs(deltaX) + Math.abs(deltaY) > 5;
    setTransform((current) => ({ ...current, x: drag.originX + deltaX, y: drag.originY + deltaY }));
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved || !bitmapRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    const fit = fitScale(canvas, bitmap);
    const displayWidth = canvas.clientWidth * fit.x * transform.scale;
    const displayHeight = canvas.clientHeight * fit.y * transform.scale;
    const normalizedX = (event.nativeEvent.offsetX - canvas.clientWidth / 2 - transform.x) / displayWidth + 0.5;
    const normalizedY = (event.nativeEvent.offsetY - canvas.clientHeight / 2 - transform.y) / displayHeight + 0.5;
    if (normalizedX < 0 || normalizedX >= 1 || normalizedY < 0 || normalizedY >= 1) return;
    const cellIndex = Math.min(assignments.length - 1, Math.floor(normalizedY * rows) * columns + Math.floor(normalizedX * columns));
    const source = sourceById.current.get(assignments[cellIndex]);
    if (source) onSelectSource(source);
  };

  return (
    <section className="mosaic-viewport-shell">
      <canvas
        aria-label="可缩放千图成像画布"
        className="mosaic-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={(event: WheelEvent<HTMLCanvasElement>) => {
          event.preventDefault();
          updateScale(event.deltaY < 0 ? 1.15 : 1 / 1.15);
        }}
        ref={canvasRef}
      />
      <div className="mosaic-viewport-tools">
        <span>{backend}</span>
        <button type="button" onClick={() => updateScale(1.25)} title="放大"><ZoomIn size={17} /></button>
        <button type="button" onClick={() => updateScale(0.8)} title="缩小"><ZoomOut size={17} /></button>
        <button type="button" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })} title="适应窗口"><Maximize2 size={17} /></button>
        <button type="button" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })} title="重置视角"><RotateCcw size={17} /></button>
      </div>
    </section>
  );
}
