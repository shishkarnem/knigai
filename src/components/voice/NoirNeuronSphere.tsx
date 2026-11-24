import React, { useEffect, useRef } from 'react';

export interface NoirNeuronSphereProps {
  isRecording?: boolean;
  size?: number;
  pointCount?: number;
  nodeColor?: string;
  lineColor?: string;
  pulseColor?: string;
  className?: string;
}

/**
 * 3D rotating neural sphere in KnigAI Noir palette (strictly white & crimson red, zero rounded borders).
 */
export const NoirNeuronSphere: React.FC<NoirNeuronSphereProps> = ({
  isRecording = false,
  size = 110,
  pointCount = 72,
  nodeColor = '#ffffff',
  lineColor = 'rgba(239, 68, 68, 0.35)',
  pulseColor = 'rgba(239, 68, 68, 0.72)',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let angleX = 0;
    let angleY = 0;

    const points: Array<{ x: number; y: number; z: number; baseR: number; phase: number }> = [];
    const radius = size * 0.37;

    for (let i = 0; i < pointCount; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / pointCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      points.push({
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.sin(phi) * Math.sin(theta),
        z: radius * Math.cos(phi),
        baseR: radius,
        phase: (i * 0.37) % (Math.PI * 2),
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const speed = isRecording ? 0.036 : 0.011;
      angleX += speed * 0.65;
      angleY += speed;

      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);

      const fov = size * 1.5;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const now = Date.now();

      const projected = points.map((p) => {
        const pulse = isRecording ? Math.sin(now * 0.0085 + p.phase) * (size * 0.06) : 0;
        const scaleFact = (p.baseR + pulse) / p.baseR;

        const px = p.x * scaleFact;
        const py = p.y * scaleFact;
        const pz = p.z * scaleFact;

        const x1 = px * cosY - pz * sinY;
        const z1 = pz * cosY + px * sinY;
        const y2 = py * cosX - z1 * sinX;
        const z2 = z1 * cosX + py * sinX;

        const scale = fov / (fov + z2 + size * 0.5);
        const x2d = x1 * scale + cx;
        const y2d = y2 * scale + cy;
        const alpha = Math.max(0.18, (z2 + radius) / (2 * radius));

        return { x: x2d, y: y2d, alpha, scale };
      });

      const maxDistance = isRecording ? size * 0.3 : size * 0.23;
      ctx.lineWidth = 1;

      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDistance) {
            const lineAlpha =
              (1 - dist / maxDistance) * 0.48 * Math.min(projected[i].alpha, projected[j].alpha);
            ctx.strokeStyle = lineColor.replace(/[\d.]+\)$/g, `${lineAlpha.toFixed(3)})`);
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        const isCrimsonNode = i % 3 === 0;
        ctx.fillStyle = isCrimsonNode ? '#ef4444' : nodeColor;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        const dotSize = (isRecording ? 2.4 : 1.7) * p.scale;
        ctx.arc(p.x, p.y, dotSize, 0, Math.PI * 2);
        ctx.fill();

        if (isRecording && p.alpha > 0.62 && isCrimsonNode) {
          ctx.fillStyle = pulseColor;
          ctx.beginPath();
          ctx.arc(p.x, p.y, dotSize * 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isRecording, size, pointCount, nodeColor, lineColor, pulseColor]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
    />
  );
};
