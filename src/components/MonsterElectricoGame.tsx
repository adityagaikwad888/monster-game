import React, { useEffect, useRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Point {
  x: number;
  y: number;
}

interface Segment {
  pos: Point;
  nextPos: Point;
  length: number;
  angle: number;
  first: boolean;
  update: (target: Point) => void;
  fallback: (target: Point) => void;
}

interface Tentacle {
  x: number;
  y: number;
  length: number;
  numSegments: number;
  segments: Segment[];
  target: Point;
  rand: number;
  angle: number;
  dt: number;
}

interface Orb {
  x: number;
  y: number;
  radius: number;
  pulsePhase: number;
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const MonsterElectricoGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [gameState, setGameState] = useState<"playing" | "ended">("playing");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);

  // Utility function for distance calculation
  const dist = useCallback(
    (p1x: number, p1y: number, p2x: number, p2y: number): number => {
      return Math.sqrt(Math.pow(p2x - p1x, 2) + Math.pow(p2y - p1y, 2));
    },
    []
  );

  // Segment class
  class TentacleSegment {
    pos: Point;
    nextPos: Point;
    length: number;
    angle: number;
    first: boolean;

    constructor(
      parent: { x: number; y: number } | { nextPos: Point },
      length: number,
      angle: number,
      first: boolean
    ) {
      this.first = first;
      if (first) {
        this.pos = {
          x: (parent as { x: number; y: number }).x,
          y: (parent as { x: number; y: number }).y,
        };
      } else {
        this.pos = {
          x: (parent as { nextPos: Point }).nextPos.x,
          y: (parent as { nextPos: Point }).nextPos.y,
        };
      }
      this.length = length;
      this.angle = angle;
      this.nextPos = {
        x: this.pos.x + this.length * Math.cos(this.angle),
        y: this.pos.y + this.length * Math.sin(this.angle),
      };
    }

    update(target: Point) {
      this.angle = Math.atan2(target.y - this.pos.y, target.x - this.pos.x);
      this.pos.x = target.x + this.length * Math.cos(this.angle - Math.PI);
      this.pos.y = target.y + this.length * Math.sin(this.angle - Math.PI);
      this.nextPos.x = this.pos.x + this.length * Math.cos(this.angle);
      this.nextPos.y = this.pos.y + this.length * Math.sin(this.angle);
    }

    fallback(target: Point) {
      this.pos.x = target.x;
      this.pos.y = target.y;
      this.nextPos.x = this.pos.x + this.length * Math.cos(this.angle);
      this.nextPos.y = this.pos.y + this.length * Math.sin(this.angle);
    }
  }

  // Game objects
  const monster = useRef({
    coreX: 400,
    coreY: 300,
    coreRadius: 15,
    tentacles: [] as Tentacle[],
    mouseX: 400,
    mouseY: 300,
    lastTarget: { x: 400, y: 300 },
    targetErrorX: 0,
    targetErrorY: 0,
    autoMoveTime: 0,
    nearBoundary: false,
  });

  const orbs = useRef<Orb[]>([]);
  const particles = useRef<Particle[]>([]);

  const initializeTentacles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Adjust tentacle count based on screen size for better performance
    const isMobile = window.innerWidth < 768;
    const tentacleCount = isMobile ? 150 : 300; // Reduced for mobile
    const maxLength = isMobile ? 200 : 300; // Shorter tentacles on mobile
    const minLength = isMobile ? 30 : 50;
    const numSegments = isMobile ? 20 : 30; // Fewer segments on mobile for better performance

    monster.current.tentacles = Array.from({ length: tentacleCount }, () => {
      const length = Math.random() * (maxLength - minLength) + minLength;
      const tentacle: Tentacle = {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        length: length,
        numSegments: numSegments,
        segments: [],
        target: { x: 0, y: 0 },
        rand: Math.random(),
        angle: 0,
        dt: 0,
      };

      // Create segments
      const segmentLength = length / numSegments;
      tentacle.segments = [
        new TentacleSegment(tentacle, segmentLength, 0, true),
      ];

      for (let i = 1; i < numSegments; i++) {
        tentacle.segments.push(
          new TentacleSegment(tentacle.segments[i - 1], segmentLength, 0, false)
        );
      }

      return tentacle;
    });
  }, []);

  const generateOrbs = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const borderWidth = 6;
    const margin = 60; // Extra margin from borders for better spacing

    orbs.current = Array.from({ length: 3 }, () => ({
      x:
        margin +
        borderWidth +
        Math.random() * (canvas.width - 2 * (margin + borderWidth)),
      y:
        margin +
        borderWidth +
        Math.random() * (canvas.height - 2 * (margin + borderWidth)),
      radius: 8 + Math.random() * 4,
      pulsePhase: Math.random() * Math.PI * 2,
      collected: false,
    }));
  }, []);

  const regenerateOrb = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const borderWidth = 6;
    const margin = 60; // Extra margin from borders for better spacing

    orbs.current[index] = {
      x:
        margin +
        borderWidth +
        Math.random() * (canvas.width - 2 * (margin + borderWidth)),
      y:
        margin +
        borderWidth +
        Math.random() * (canvas.height - 2 * (margin + borderWidth)),
      radius: 8 + Math.random() * 4,
      pulsePhase: Math.random() * Math.PI * 2,
      collected: false,
    };
  }, []);

  const createParticles = useCallback(
    (x: number, y: number, count: number = 15) => {
      for (let i = 0; i < count; i++) {
        particles.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          life: 1,
          maxLife: 30 + Math.random() * 20,
          size: 2 + Math.random() * 3,
        });
      }
    },
    []
  );

  const updateMonster = useCallback(() => {
    const m = monster.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Enhanced target movement logic from original Monster_Electrico
    let targetX, targetY;

    if (m.mouseX && m.mouseY) {
      // Use mouse position when available
      m.targetErrorX = m.mouseX - m.coreX;
      m.targetErrorY = m.mouseY - m.coreY;
    } else {
      // Auto-movement with figure-8 pattern when no mouse input
      const q = 10;
      const t = m.autoMoveTime;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      const autoX =
        centerX +
        ((centerY / 2 - q) * Math.sqrt(2) * Math.cos(t)) /
          (Math.pow(Math.sin(t), 2) + 1);
      const autoY =
        centerY +
        ((centerY / 2 - q) * Math.sqrt(2) * Math.cos(t) * Math.sin(t)) /
          (Math.pow(Math.sin(t), 2) + 1);

      m.targetErrorX = autoX - m.coreX;
      m.targetErrorY = autoY - m.coreY;
    }

    // Smooth movement interpolation
    m.coreX += m.targetErrorX / 10;
    m.coreY += m.targetErrorY / 10;

    // Increment auto-move time
    m.autoMoveTime += 0.01;

    const target = { x: m.coreX, y: m.coreY };
    const lastTarget = m.lastTarget;

    // Update each tentacle with enhanced movement
    m.tentacles.forEach((tentacle) => {
      // Calculate tentacle movement
      tentacle.angle = Math.atan2(target.y - tentacle.y, target.x - tentacle.x);
      tentacle.dt = dist(lastTarget.x, lastTarget.y, target.x, target.y) + 5;

      const t = {
        x: target.x - 0.8 * tentacle.dt * Math.cos(tentacle.angle),
        y: target.y - 0.8 * tentacle.dt * Math.sin(tentacle.angle),
      };

      // Update segments
      if (t.x) {
        tentacle.segments[tentacle.numSegments - 1].update(t);
      } else {
        tentacle.segments[tentacle.numSegments - 1].update(target);
      }

      for (let i = tentacle.numSegments - 2; i >= 0; i--) {
        tentacle.segments[i].update(tentacle.segments[i + 1].pos);
      }

      // Fallback if tentacle is too far
      if (
        dist(tentacle.x, tentacle.y, target.x, target.y) <=
        tentacle.length + dist(lastTarget.x, lastTarget.y, target.x, target.y)
      ) {
        tentacle.segments[0].fallback({ x: tentacle.x, y: tentacle.y });
        for (let i = 1; i < tentacle.numSegments; i++) {
          tentacle.segments[i].fallback(tentacle.segments[i - 1].nextPos);
        }
      }
    });

    // Update last target
    m.lastTarget = { x: target.x, y: target.y };
  }, [dist]);

  const checkCollisions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const m = monster.current;
    const borderWidth = 6;
    const warningDistance = 40; // Distance from boundary to show warning

    // Check boundary collision with enhanced border detection
    if (
      m.coreX <= m.coreRadius + borderWidth ||
      m.coreX >= canvas.width - m.coreRadius - borderWidth ||
      m.coreY <= m.coreRadius + borderWidth ||
      m.coreY >= canvas.height - m.coreRadius - borderWidth
    ) {
      setGameState("ended");
      return;
    }

    // Check near boundary warning
    m.nearBoundary =
      m.coreX <= m.coreRadius + borderWidth + warningDistance ||
      m.coreX >= canvas.width - m.coreRadius - borderWidth - warningDistance ||
      m.coreY <= m.coreRadius + borderWidth + warningDistance ||
      m.coreY >= canvas.height - m.coreRadius - borderWidth - warningDistance;

    // Check orb collisions
    orbs.current.forEach((orb, index) => {
      if (!orb.collected) {
        const distance = Math.sqrt(
          (m.coreX - orb.x) ** 2 + (m.coreY - orb.y) ** 2
        );
        if (distance < m.coreRadius + orb.radius) {
          orb.collected = true;
          setScore((prev) => prev + 1);
          createParticles(orb.x, orb.y);

          // Regenerate the orb after a short delay
          setTimeout(() => {
            regenerateOrb(index);
          }, 500);
        }
      }
    });
  }, [createParticles, regenerateOrb]);

  const updateParticles = useCallback(() => {
    particles.current = particles.current.filter((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      particle.life--;
      return particle.life > 0;
    });
  }, []);

  const drawBackground = useCallback(
    (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      // Dark space background similar to original
      ctx.fillStyle = "rgba(30,30,30,1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Near boundary warning overlay
      const m = monster.current;
      if (m.nearBoundary) {
        const warningAlpha = Math.sin(Date.now() * 0.01) * 0.1 + 0.1;
        ctx.fillStyle = `rgba(255, 0, 0, ${warningAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Add subtle stars
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 1.5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Premium animated boundary
      const time = Date.now() * 0.005;
      const borderWidth = 4;
      const glowIntensity = Math.sin(time) * 0.3 + 0.7;

      // Enhanced glow when near boundary
      const enhancedGlow = m.nearBoundary ? glowIntensity * 1.5 : glowIntensity;

      // Outer glow
      ctx.shadowColor = `rgba(0, 255, 255, ${enhancedGlow})`;
      ctx.shadowBlur = m.nearBoundary ? 30 : 20;
      ctx.strokeStyle = `rgba(0, 255, 255, ${enhancedGlow * 0.8})`;
      ctx.lineWidth = borderWidth + 2;
      ctx.setLineDash([10, 5]);
      ctx.lineDashOffset = -time * 20;

      ctx.beginPath();
      ctx.rect(2, 2, canvas.width - 4, canvas.height - 4);
      ctx.stroke();

      // Inner solid border
      ctx.shadowBlur = m.nearBoundary ? 15 : 10;
      ctx.strokeStyle = `rgba(255, 255, 255, ${enhancedGlow})`;
      ctx.lineWidth = borderWidth;
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.rect(2, 2, canvas.width - 4, canvas.height - 4);
      ctx.stroke();

      // Corner accents with warning effect
      const cornerSize = 20;
      ctx.shadowBlur = m.nearBoundary ? 20 : 15;
      const cornerColor = m.nearBoundary
        ? `rgba(255, 0, 0, ${enhancedGlow})`
        : `rgba(255, 0, 255, ${enhancedGlow})`;
      ctx.strokeStyle = cornerColor;
      ctx.lineWidth = 3;

      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(2, cornerSize);
      ctx.lineTo(2, 2);
      ctx.lineTo(cornerSize, 2);
      ctx.stroke();

      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(canvas.width - cornerSize, 2);
      ctx.lineTo(canvas.width - 2, 2);
      ctx.lineTo(canvas.width - 2, cornerSize);
      ctx.stroke();

      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(2, canvas.height - cornerSize);
      ctx.lineTo(2, canvas.height - 2);
      ctx.lineTo(cornerSize, canvas.height - 2);
      ctx.stroke();

      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(canvas.width - cornerSize, canvas.height - 2);
      ctx.lineTo(canvas.width - 2, canvas.height - 2);
      ctx.lineTo(canvas.width - 2, canvas.height - cornerSize);
      ctx.stroke();

      ctx.shadowBlur = 0;
    },
    []
  );

  const drawMonster = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const m = monster.current;
      const target = { x: m.coreX, y: m.coreY };

      // Draw target orb with enhanced glow
      ctx.beginPath();
      ctx.arc(
        target.x,
        target.y,
        dist(m.lastTarget.x, m.lastTarget.y, target.x, target.y) + 5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "hsl(210,100%,80%)";
      ctx.fill();

      // Draw tentacle dots (enhanced from original)
      m.tentacles.forEach((tentacle) => {
        ctx.beginPath();
        if (
          dist(tentacle.x, tentacle.y, target.x, target.y) <= tentacle.length
        ) {
          ctx.arc(
            tentacle.x,
            tentacle.y,
            2 * tentacle.rand + 1,
            0,
            2 * Math.PI
          );
          ctx.fillStyle = "white";
        } else {
          ctx.arc(tentacle.x, tentacle.y, tentacle.rand * 2, 0, 2 * Math.PI);
          ctx.fillStyle = "darkcyan";
        }
        ctx.fill();
      });

      // Draw tentacle lines with enhanced effects
      m.tentacles.forEach((tentacle) => {
        if (
          dist(tentacle.x, tentacle.y, target.x, target.y) <= tentacle.length
        ) {
          ctx.globalCompositeOperation = "lighter";
          ctx.beginPath();
          ctx.moveTo(tentacle.x, tentacle.y);

          // Draw all segments
          for (let i = 0; i < tentacle.numSegments; i++) {
            ctx.lineTo(
              tentacle.segments[i].nextPos.x,
              tentacle.segments[i].nextPos.y
            );
          }

          // Enhanced coloring from original
          const hue = tentacle.rand * 60 + 180;
          const lightness = tentacle.rand * 60 + 25;
          ctx.strokeStyle = `hsl(${hue}, 100%, ${lightness}%)`;
          ctx.lineWidth = tentacle.rand * 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
        }
      });

      // Draw core with cosmic appearance
      const time = Date.now() * 0.01;
      const pulseIntensity = Math.sin(time) * 0.3 + 0.7;

      // Main cosmic core body with blue/purple theme
      ctx.fillStyle = "#2a0845"; // Deep purple
      ctx.shadowColor = "#8b00ff";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(m.coreX, m.coreY, m.coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Cosmic creature with galactic eyes
      const eyeOffset = m.coreRadius * 0.45;
      const currentTime = Date.now() * 0.003;

      // Galactic eye backgrounds with nebula effect
      const gradient1 = ctx.createRadialGradient(
        m.coreX - eyeOffset,
        m.coreY - eyeOffset * 0.4,
        0,
        m.coreX - eyeOffset,
        m.coreY - eyeOffset * 0.4,
        m.coreRadius * 0.3 * 1.2
      );
      gradient1.addColorStop(0, "#4a0080");
      gradient1.addColorStop(0.5, "#8b00ff");
      gradient1.addColorStop(1, "#000033");

      const gradient2 = ctx.createRadialGradient(
        m.coreX + eyeOffset,
        m.coreY - eyeOffset * 0.4,
        0,
        m.coreX + eyeOffset,
        m.coreY - eyeOffset * 0.4,
        m.coreRadius * 0.3 * 1.2
      );
      gradient2.addColorStop(0, "#004080");
      gradient2.addColorStop(0.5, "#00bfff");
      gradient2.addColorStop(1, "#000033");

      // Left galactic eye
      ctx.fillStyle = gradient1;
      ctx.shadowColor = "#8b00ff";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(
        m.coreX - eyeOffset,
        m.coreY - eyeOffset * 0.4,
        m.coreRadius * 0.3,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Right galactic eye
      ctx.fillStyle = gradient2;
      ctx.shadowColor = "#00bfff";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(
        m.coreX + eyeOffset,
        m.coreY - eyeOffset * 0.4,
        m.coreRadius * 0.3,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Swirling galaxy pattern in eyes
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 5;

      // Left eye spiral
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 4 + currentTime;
        const radius = (i / 20) * m.coreRadius * 0.3 * 0.7;
        const x = m.coreX - eyeOffset + Math.cos(angle) * radius;
        const y = m.coreY - eyeOffset * 0.4 + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Right eye spiral
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 4 - currentTime;
        const radius = (i / 20) * m.coreRadius * 0.3 * 0.7;
        const x = m.coreX + eyeOffset + Math.cos(angle) * radius;
        const y = m.coreY - eyeOffset * 0.4 + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Bright cosmic pupils
      const pupilPulse = Math.sin(currentTime * 2) * 0.2 + 0.8;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(
        m.coreX - eyeOffset,
        m.coreY - eyeOffset * 0.4,
        m.coreRadius * 0.3 * 0.25 * pupilPulse,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ff00ff";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(
        m.coreX + eyeOffset,
        m.coreY - eyeOffset * 0.4,
        m.coreRadius * 0.3 * 0.25 * pupilPulse,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Cosmic energy mouth - wavy energy pattern
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 15;
      ctx.beginPath();

      const mouthY = m.coreY + eyeOffset * 0.4;
      const mouthWidth = eyeOffset * 1.4;

      // Create wavy energy mouth
      for (let i = 0; i <= 30; i++) {
        const progress = i / 30;
        const baseX = m.coreX + (progress - 0.5) * mouthWidth;
        const waveHeight =
          Math.sin(progress * Math.PI * 3 + currentTime * 4) * 6;
        const y = mouthY + waveHeight;

        if (i === 0) ctx.moveTo(baseX, y);
        else ctx.lineTo(baseX, y);
      }
      ctx.stroke();

      // Energy particles around mouth
      ctx.fillStyle = "#00ffff";
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 10;

      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + currentTime * 2;
        const distance = eyeOffset * 0.8 + Math.sin(currentTime * 3 + i) * 5;
        const x = m.coreX + Math.cos(angle) * distance;
        const y = mouthY + Math.sin(angle) * distance * 0.3;
        const size = 2 + Math.sin(currentTime * 4 + i) * 1;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Mystical third eye/gem on forehead
      ctx.fillStyle = "#ff00ff";
      ctx.shadowColor = "#ff00ff";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(
        m.coreX,
        m.coreY - eyeOffset * 0.8,
        m.coreRadius * 0.3 * 0.4,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Inner gem facets
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 10;
      const gemSize = m.coreRadius * 0.3 * 0.4;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + currentTime;
        const x = m.coreX + Math.cos(angle) * gemSize * 0.3;
        const y = m.coreY - eyeOffset * 0.8 + Math.sin(angle) * gemSize * 0.3;

        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cosmic markings/tattoos on the face
      ctx.strokeStyle = "#8b00ff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#8b00ff";
      ctx.shadowBlur = 8;

      // Left face marking
      ctx.beginPath();
      ctx.arc(m.coreX - eyeOffset * 1.2, m.coreY, eyeOffset * 0.3, 0, Math.PI);
      ctx.stroke();

      // Right face marking
      ctx.beginPath();
      ctx.arc(m.coreX + eyeOffset * 1.2, m.coreY, eyeOffset * 0.3, 0, Math.PI);
      ctx.stroke();

      ctx.shadowBlur = 0;
    },
    [dist]
  );

  const drawOrbs = useCallback((ctx: CanvasRenderingContext2D) => {
    orbs.current.forEach((orb, index) => {
      if (!orb.collected) {
        orb.pulsePhase += 0.1;
        const pulseSize = orb.radius + Math.sin(orb.pulsePhase) * 3;

        // Different colors for each orb
        const colors = ["#00ffff", "#ff00ff", "#ffff00"];
        const shadowColors = ["#00ffff", "#ff00ff", "#ffff00"];
        const currentColor = colors[index % colors.length];
        const currentShadowColor = shadowColors[index % shadowColors.length];

        // Outer glow
        ctx.fillStyle = currentColor;
        ctx.shadowColor = currentShadowColor;
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // Middle ring
        ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, pulseSize * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, pulseSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.shadowBlur = 0;
  }, []);

  const drawParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    particles.current.forEach((particle) => {
      const alpha = particle.life / particle.maxLife;
      ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }, []);

  const drawUI = useCallback(
    (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      // UI is now handled by the navbar component
      // No need to draw text overlay on canvas
    },
    [score, timeLeft]
  );

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw everything
    drawBackground(ctx, canvas);
    drawOrbs(ctx);
    drawParticles(ctx);
    drawMonster(ctx);
    drawUI(ctx, canvas);

    // Update game state
    if (gameState === "playing") {
      updateMonster();
      updateParticles();
      checkCollisions();
    }

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [
    gameState,
    drawBackground,
    drawOrbs,
    drawParticles,
    drawMonster,
    drawUI,
    updateMonster,
    updateParticles,
    checkCollisions,
  ]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      monster.current.mouseX = event.clientX - rect.left;
      monster.current.mouseY = event.clientY - rect.top;
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    // Reset mouse position to trigger auto-movement
    monster.current.mouseX = 0;
    monster.current.mouseY = 0;
  }, []);

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const touch = event.touches[0];
      monster.current.mouseX = touch.clientX - rect.left;
      monster.current.mouseY = touch.clientY - rect.top;
    },
    []
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const touch = event.touches[0];
      monster.current.mouseX = touch.clientX - rect.left;
      monster.current.mouseY = touch.clientY - rect.top;
    },
    []
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      // Keep the last touch position instead of resetting
      // This prevents the monster from snapping back to auto-movement
    },
    []
  );

  const startGame = useCallback(() => {
    setGameState("playing");
    setScore(0);
    setTimeLeft(60);
    initializeTentacles();
    generateOrbs();
    particles.current = [];

    const canvas = canvasRef.current;
    if (canvas) {
      monster.current.coreX = canvas.width / 2;
      monster.current.coreY = canvas.height / 2;
      monster.current.mouseX = canvas.width / 2;
      monster.current.mouseY = canvas.height / 2;
    }
  }, [initializeTentacles, generateOrbs]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (container) {
      // Get the container dimensions
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Set canvas size to match container
      canvas.width = containerWidth;
      canvas.height = containerHeight;

      // Adjust monster position to stay within bounds after resize
      const centerX = containerWidth / 2;
      const centerY = containerHeight / 2;

      // Only adjust if monster is outside new bounds
      if (monster.current.coreX > containerWidth - 50) {
        monster.current.coreX = centerX;
      }
      if (monster.current.coreY > containerHeight - 50) {
        monster.current.coreY = centerY;
      }
    }
  }, []);

  // Timer effect
  useEffect(() => {
    if (gameState === "playing" && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setGameState("ended");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, timeLeft]);

  // Initialize game
  useEffect(() => {
    resizeCanvas();
    startGame();

    const handleResize = () => resizeCanvas();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [resizeCanvas, startGame]);

  // Start game loop
  useEffect(() => {
    gameLoop();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameLoop]);

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      {/* Stunning Navbar */}
      <div className="bg-gradient-to-r from-purple-900 via-blue-900 to-cyan-900 border-b border-cyan-500/30 shadow-lg">
        {/* Mobile Layout */}
        <div className="sm:hidden">
          {/* Top row - Logo and Button */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Cosmic Arena
              </h1>
            </div>
            <Button
              onClick={startGame}
              className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white px-2 py-1 rounded text-xs font-medium"
            >
              New
            </Button>
          </div>

          {/* Bottom row - Stats */}
          <div className="flex items-center justify-center space-x-8 px-3 pb-2">
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-bold">
                Score
              </div>
              <div
                className="text-lg font-bold text-cyan-400 font-serif"
                style={{ fontFamily: "Times New Roman, serif" }}
              >
                {score}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-bold">
                Time
              </div>
              <div
                className="text-lg font-bold text-purple-400 font-serif"
                style={{ fontFamily: "Times New Roman, serif" }}
              >
                {timeLeft}s
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:flex items-center justify-between px-6 py-4">
          {/* Logo/Title */}
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Cosmic Tentacle Arena
            </h1>
          </div>

          {/* Game Stats */}
          <div className="flex items-center space-x-6">
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-bold">
                Score
              </div>
              <div
                className="text-3xl font-bold text-cyan-400 font-serif tracking-wider"
                style={{ fontFamily: "Times New Roman, serif" }}
              >
                {score}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-bold">
                Time
              </div>
              <div
                className="text-2xl font-bold text-purple-400 font-serif"
                style={{ fontFamily: "Times New Roman, serif" }}
              >
                {timeLeft}s
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <Button
              onClick={startGame}
              className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
            >
              New Game
            </Button>
          </div>
        </div>

        {/* Subtitle - Hidden on mobile */}
        <div className="px-6 pb-3 hidden sm:block">
          <p className="text-base text-gray-200 flex items-center space-x-6 font-bold">
            <span className="flex items-center">
              <span className="w-3 h-3 bg-cyan-400 rounded-full mr-3 animate-pulse"></span>
              <span className="text-cyan-300 font-extrabold tracking-wide">
                Guide the electric creature
              </span>
            </span>
            <span className="flex items-center">
              <span className="w-3 h-3 bg-purple-400 rounded-full mr-3 animate-pulse"></span>
              <span className="text-purple-300 font-extrabold tracking-wide">
                Collect energy orbs
              </span>
            </span>
            <span className="flex items-center">
              <span className="w-3 h-3 bg-red-400 rounded-full mr-3 animate-pulse"></span>
              <span className="text-red-300 font-extrabold tracking-wide">
                Avoid boundaries
              </span>
            </span>
          </p>
        </div>

        {/* Mobile Instructions */}
        <div className="px-3 pb-1 sm:hidden">
          <p className="text-xs text-gray-200 text-center font-bold">
            <span className="text-cyan-300">Touch to guide</span> •
            <span className="text-purple-300"> Collect orbs</span> •
            <span className="text-red-300"> Avoid edges</span>
          </p>
        </div>
      </div>

      {/* Game Container */}
      <div className="flex-1 relative bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-none touch-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {gameState === "ended" && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-40 p-4">
          <Card className="p-4 sm:p-8 text-center bg-gray-800 border-cyan-500 border-2 w-full max-w-md">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Game Over!
            </h2>
            <p className="text-lg sm:text-xl text-cyan-300 mb-2">
              Final Score:{" "}
              <span
                className="text-2xl sm:text-4xl font-bold text-cyan-400 font-serif tracking-wider"
                style={{ fontFamily: "Times New Roman, serif" }}
              >
                {score}
              </span>
            </p>
            <p className="text-base sm:text-lg text-gray-300 mb-6">
              {timeLeft === 0 ? "Time's up!" : "Touched the boundary!"}
            </p>
            <Button
              onClick={startGame}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 sm:px-8 py-2 sm:py-3 text-base sm:text-lg"
            >
              Play Again
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MonsterElectricoGame;
