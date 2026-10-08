"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/lab/provider";
import { drawBat } from "./castle-scene";

/**
 * A few ink bats crossing the top of a page. Ambience for the Lab and the
 * Interview only. Not drawn under reduced motion; paused while the tab is
 * hidden; carries no information.
 */
export function Bats() {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d")!;
    let seed = 31;
    const R = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const bats = Array.from({ length: 7 }, () => ({
      u: R(),
      v: R(),
      sp: 14 + R() * 26,
      ph: R() * 6,
      z: 5 + R() * 7,
    }));
    let W = 0;
    let H = 0;
    let raf = 0;
    const size = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const frame = (ms: number) => {
      const t = ms / 1000;
      ctx.clearRect(0, 0, W, H);
      const span = W + 80;
      for (const b of bats) {
        const bx = -40 + ((b.u * span + t * b.sp) % span);
        const by = 18 + b.v * (H - 60) + Math.sin(t * 0.9 + b.ph) * 12;
        // Ink on a near-black page would vanish; a dim blood tone keeps them just visible.
        drawBat(ctx, bx, by, b.z, Math.sin(t * 11 + b.ph), "#5c1018");
      }
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    size();
    raf = requestAnimationFrame(frame);
    const observer = new ResizeObserver(size);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={ref} className="bats" aria-hidden="true" />;
}
