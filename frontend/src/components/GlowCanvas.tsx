import { useEffect, useRef } from "react";

interface Point {
  x: number;
  y: number;
  age: number;
}

const GlowCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      pointsRef.current.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (pointsRef.current.length > 80) pointsRef.current.shift();
    };
    window.addEventListener("mousemove", onMove);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pts = pointsRef.current;

      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const prev = pts[i - 1];
        const life = 1 - p.age / 60;
        if (life <= 0) continue;

        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `hsla(${180 + (i * 2) % 100}, 100%, 60%, ${life * 0.7})`;
        ctx.lineWidth = life * 4;
        ctx.shadowColor = `hsla(180, 100%, 50%, ${life * 0.5})`;
        ctx.shadowBlur = 20;
        ctx.stroke();
      }

      pts.forEach((p) => (p.age += 1));
      pointsRef.current = pts.filter((p) => p.age < 60);

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
};

export default GlowCanvas;
