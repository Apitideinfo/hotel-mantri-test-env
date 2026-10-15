import React, { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  shape: 'circle' | 'star' | 'strip';
  rotation: number;
  vRot: number;
  opacity: number;
}

const COLORS = [
  '#3b82f6', // Sapphire Blue
  '#6366f1', // Indigo
  '#f59e0b', // Golden Amber
  '#10b981', // Emerald
  '#ec4899', // Pink / Rose
  '#06b6d4', // Cyan
  '#fbbf24', // Warm Gold
  '#ffffff', // Sparkle White
];

export const CelebrationBurst: React.FC<{ active?: boolean; durationMs?: number }> = ({
  active = true,
  durationMs = 4000,
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    // Generate initial left and right fountain fireworks / phuljhadiyan
    const newParticles: Particle[] = [];
    const count = 75;

    for (let i = 0; i < count; i++) {
      // Left side burst
      const isLeft = i % 2 === 0;
      const originX = isLeft ? 10 + Math.random() * 15 : 75 + Math.random() * 15;
      const originY = 60 + Math.random() * 30;

      const angle = isLeft
        ? (Math.PI / 180) * (300 + Math.random() * 70) // up & right
        : (Math.PI / 180) * (170 + Math.random() * 70); // up & left

      const speed = 4 + Math.random() * 9;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const shapes: ('circle' | 'star' | 'strip')[] = ['circle', 'star', 'strip'];
      const shape = shapes[Math.floor(Math.random() * shapes.length)];

      newParticles.push({
        id: i,
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed * (isLeft ? 1 : -1) * 0.4,
        vy: -Math.abs(Math.sin(angle) * speed) * 0.55,
        color,
        size: shape === 'strip' ? 4 + Math.random() * 6 : 4 + Math.random() * 5,
        shape,
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 15,
        opacity: 1,
      });
    }

    setParticles(newParticles);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > durationMs) {
        setParticles([]);
        clearInterval(interval);
        return;
      }

      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.18, // Gravity
            rotation: p.rotation + p.vRot,
            opacity: Math.max(0, 1 - elapsed / durationMs),
          }))
          .filter((p) => p.y < 120 && p.opacity > 0.05)
      );
    }, 25);

    return () => clearInterval(interval);
  }, [active, durationMs]);

  if (!active || particles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {/* Side Sparkler Glow Emitters */}
      <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-32 h-32 bg-amber-400/20 rounded-full blur-2xl animate-pulse" />
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl animate-pulse" />

      {/* Sparkles / Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: p.shape === 'strip' ? `${p.size * 2.5}px` : `${p.size}px`,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'strip' ? '2px' : '1px',
            transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
            opacity: p.opacity,
            boxShadow: `0 0 8px ${p.color}`,
            transition: 'opacity 0.1s linear',
          }}
        />
      ))}
    </div>
  );
};
