import React, { useEffect, useRef, useState } from "react";

const COLORS = [
  "#111827",
  "#ef4444",
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#a855f7",
];

export default function Whiteboard({ socket, strokes, setStrokes }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(null);

  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#111827");
  const [lineWidth, setLineWidth] = useState(3);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    strokes.forEach((stroke) => {
      if (!stroke.points?.length) return;

      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle =
        stroke.tool === "eraser" ? "#ffffff" : stroke.color;
      ctx.lineWidth =
        stroke.tool === "eraser" ? stroke.width * 4 : stroke.width;

      const first = stroke.points[0];

      ctx.moveTo(
        first.x * rect.width,
        first.y * rect.height
      );

      stroke.points.slice(1).forEach((point) => {
        ctx.lineTo(
          point.x * rect.width,
          point.y * rect.height
        );
      });

      if (stroke.points.length === 1) {
        ctx.lineTo(
          first.x * rect.width + 0.1,
          first.y * rect.height + 0.1
        );
      }

      ctx.stroke();
    });
  };

  useEffect(() => {
    redraw();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [strokes]);

  const getPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();

    return {
      x: Math.min(
        1,
        Math.max(0, (event.clientX - rect.left) / rect.width)
      ),
      y: Math.min(
        1,
        Math.max(0, (event.clientY - rect.top) / rect.height)
      ),
    };
  };

  const startDrawing = (event) => {
    if (event.button !== 0) return;

    event.preventDefault();

    const point = getPoint(event);

    const stroke = {
      id:
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      color,
      width: lineWidth,
      tool,
      points: [point],
    };

    drawingRef.current = stroke;

    setStrokes((previous) => [...previous, stroke]);

    socket?.emit("whiteboard:stroke-start", stroke);

    canvasRef.current.setPointerCapture(event.pointerId);
  };

  const continueDrawing = (event) => {
    const stroke = drawingRef.current;
    if (!stroke) return;

    const point = getPoint(event);

    stroke.points = [...stroke.points, point];

    setStrokes((previous) =>
      previous.map((item) =>
        item.id === stroke.id ? stroke : item
      )
    );

    socket?.emit("whiteboard:stroke-point", {
      strokeId: stroke.id,
      point,
    });
  };

  const stopDrawing = () => {
    drawingRef.current = null;
  };

  const undo = () => {
    if (!strokes.length) return;

    setStrokes((previous) => previous.slice(0, -1));
    socket?.emit("whiteboard:undo");
  };

  const clear = () => {
    setStrokes([]);
    socket?.emit("whiteboard:clear");
  };

  return (
    <div className="whiteboard-wrap">
      <div className="whiteboard-toolbar">
        <div className="whiteboard-tool-group">
          <button
            type="button"
            className={`whiteboard-tool ${tool === "pen" ? "selected" : ""}`}
            onClick={() => setTool("pen")}
          >
            ✎ Pen
          </button>

          <button
            type="button"
            className={`whiteboard-tool ${tool === "eraser" ? "selected" : ""}`}
            onClick={() => setTool("eraser")}
          >
            Eraser
          </button>
        </div>

        <div className="whiteboard-colors">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`Select ${item}`}
              className={`color-swatch ${color === item ? "selected" : ""}`}
              style={{ backgroundColor: item }}
              onClick={() => {
                setColor(item);
                setTool("pen");
              }}
            />
          ))}
        </div>

        <label className="whiteboard-size">
          Size
          <input
            type="range"
            min="1"
            max="12"
            value={lineWidth}
            onChange={(event) =>
              setLineWidth(Number(event.target.value))
            }
          />
        </label>

        <div className="whiteboard-actions">
          <button
            type="button"
            className="whiteboard-tool"
            onClick={undo}
          >
            Undo
          </button>

          <button
            type="button"
            className="whiteboard-tool danger"
            onClick={clear}
          >
            Clear
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        onPointerDown={startDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onLostPointerCapture={stopDrawing}
      />

      <div className="whiteboard-hint">
        Draw together in real time. Drawings are temporary.
      </div>
    </div>
  );
}