"use client";

import { useEffect, useRef } from "react";

/**
 * The painted hero of Tonight: a blood eclipse over a cliff-top castle, drawn
 * on a canvas by the design reference's seeded routine, ported unchanged in
 * shape and proportion. It is decoration only and carries no information.
 * A single still frame under reduced motion; paused while the tab is hidden.
 */

type Ctx = CanvasRenderingContext2D;

const INK = "#070204";
const RIM = "#8a1c22";

function rng(seed: number) {
  return function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Soft painterly blob: an ellipse filled with a radial falloff. */
function blob(
  ctx: Ctx,
  bx: number,
  by: number,
  rx: number,
  ry: number,
  rgb: string,
  a: number,
) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(1, ry / rx);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, 7);
  ctx.fill();
  ctx.restore();
}

/** The ink bat shared by the scene and by the bat ambience. */
export function drawBat(
  x: Ctx,
  bx: number,
  by: number,
  z: number,
  fl: number,
  color = INK,
) {
  x.save();
  x.translate(bx, by);
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(0, -z * 0.2);
  for (const d of [1, -1]) {
    x.lineTo(d * z * 0.5, -z * 0.5 * fl);
    x.lineTo(d * z * 1.3, -z * 0.1 * fl);
    x.lineTo(d * z * 0.9, z * 0.15);
    x.lineTo(d * z * 0.55, z * 0.05);
    x.lineTo(d * z * 0.25, z * 0.25);
    x.lineTo(0, z * 0.15);
  }
  x.fill();
  x.restore();
}

function startScene(c: HTMLCanvasElement, still: boolean): () => void {
  const x = c.getContext("2d")!;
  const bg = document.createElement("canvas");
  const g = bg.getContext("2d")!;
  const fg = document.createElement("canvas");
  const f = fg.getContext("2d")!;
  const fog = document.createElement("canvas");
  const q = fog.getContext("2d")!;
  const grain = document.createElement("canvas");
  let W = 0;
  let H = 0;
  let dpr = 1;
  let cx = 0;
  let base = 0;
  let s = 1;
  let ecl = { x: 0, y: 0, r: 0 };
  let grainPat: CanvasPattern | null = null;

  function sky() {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#0a0103");
    gr.addColorStop(0.22, "#2a0407");
    gr.addColorStop(0.5, "#7a0a10");
    gr.addColorStop(0.74, "#c4161a");
    gr.addColorStop(0.9, "#e5321f");
    gr.addColorStop(1, "#a3141a");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // long streaked cloud banks, dark over light
    const R = rng(77);
    for (let i = 0; i < 46; i++) {
      const y = H * (0.08 + R() * 0.6);
      const dark = R() < 0.55;
      blob(
        g,
        R() * W,
        y,
        120 + R() * 380,
        6 + R() * 22,
        dark ? "20,2,5" : "255,96,70",
        dark ? 0.55 : 0.16 + R() * 0.14,
      );
    }
    const gl = g.createRadialGradient(
      ecl.x,
      base - 60 * s,
      0,
      cx,
      base - 60 * s,
      W * 0.7,
    );
    gl.addColorStop(0, "rgba(255,80,50,.35)");
    gl.addColorStop(1, "rgba(255,80,50,0)");
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H);
  }

  function eclipse() {
    const ex = ecl.x;
    const ey = ecl.y;
    const r = ecl.r;
    const co = g.createRadialGradient(ex, ey, r * 0.95, ex, ey, r * 3.2);
    co.addColorStop(0, "rgba(255,70,45,.85)");
    co.addColorStop(0.18, "rgba(230,30,30,.45)");
    co.addColorStop(1, "rgba(200,20,20,0)");
    g.fillStyle = co;
    g.beginPath();
    g.arc(ex, ey, r * 3.2, 0, 7);
    g.fill();
    // corona filaments
    const R = rng(9);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let i = 0; i < 260; i++) {
      const a = R() * Math.PI * 2;
      const low = Math.max(0, Math.sin(a));
      const len = (4 + R() * 26 + low * 22) * s;
      g.strokeStyle = `rgba(255,${(120 + R() * 90) | 0},${(100 + R() * 80) | 0},${(0.08 + R() * 0.22 + low * 0.15).toFixed(2)})`;
      g.lineWidth = (0.6 + R() * 1.2) * s;
      g.beginPath();
      g.moveTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r);
      g.lineTo(ex + Math.cos(a) * (r + len), ey + Math.sin(a) * (r + len));
      g.stroke();
    }
    g.restore();
    // the disc
    g.fillStyle = "#040102";
    g.beginPath();
    g.arc(ex, ey, r, 0, 7);
    g.fill();
    // white-hot rim, brightest along the lower edge, with beads of light
    g.save();
    g.globalCompositeOperation = "lighter";
    g.shadowColor = "#ff2a1a";
    g.shadowBlur = 16 * s;
    for (let k = 0; k < 180; k++) {
      const a0 = (k / 180) * Math.PI * 2;
      const lowk = (Math.sin(a0 + 0.25) + 1) / 2;
      g.strokeStyle = `rgba(255,${(200 + lowk * 55) | 0},${(190 + lowk * 60) | 0},${(0.25 + lowk * 0.7).toFixed(2)})`;
      g.lineWidth = (1 + lowk * 2.4 + (R() < 0.08 ? 2.5 : 0)) * s;
      g.beginPath();
      g.arc(ex, ey, r, a0, a0 + (Math.PI * 2) / 180 + 0.004);
      g.stroke();
    }
    g.restore();
  }

  function ridge(
    ctx: Ctx,
    y: number,
    amp: number,
    step: number,
    color: string,
    seed: number,
    jag: number,
  ) {
    const R = rng(seed);
    const p1 = R() * 6;
    const p2 = R() * 6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let px = -step; px <= W + step; px += step) {
      const n =
        Math.sin(px * 0.004 + p1) * 0.6 +
        Math.sin(px * 0.013 + p2) * 0.3 +
        (R() - 0.5) * jag;
      ctx.lineTo(px, y - amp * n);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  // A Carpathian fortress on a cliff: square keep, round towers with conical roofs,
  // a chapel with one bell spire, a palace wing and a lower terrace wing. Lit from the eclipse (upper right).
  function castle() {
    const R = rng(1476);
    const P = (u: number) => cx + u * s;
    const Y = (u: number) => base + u * s;
    function box(x0: number, x1: number, top: number, bot: number) {
      g.fillStyle = INK;
      g.fillRect(P(x0), Y(top), (x1 - x0) * s, (bot - top) * s);
    }
    function rimV(px: number, top: number, bot: number) {
      g.fillStyle = RIM;
      g.fillRect(P(px) - 1.6 * s, Y(top), 1.6 * s, (bot - top) * s);
    }
    function crenels(x0: number, x1: number, y: number) {
      g.fillStyle = INK;
      for (let b = x0; b < x1 - 3; b += 8)
        g.fillRect(P(b), Y(y - 6), 4.5 * s, 6.5 * s);
    }
    function roof(
      x0: number,
      x1: number,
      y: number,
      h: number,
      kind: "cone" | "hip",
    ) {
      const m = (x0 + x1) / 2;
      const inset = Math.min(h * 0.55, (x1 - x0) * 0.3);
      g.fillStyle = INK;
      g.beginPath();
      if (kind === "cone") {
        g.moveTo(P(x0), Y(y));
        g.quadraticCurveTo(
          P(m - (x1 - x0) * 0.08),
          Y(y - h * 0.5),
          P(m),
          Y(y - h),
        );
        g.quadraticCurveTo(
          P(m + (x1 - x0) * 0.08),
          Y(y - h * 0.5),
          P(x1),
          Y(y),
        );
      } else {
        g.moveTo(P(x0), Y(y));
        g.lineTo(P(x0 + inset), Y(y - h));
        g.lineTo(P(x1 - inset), Y(y - h));
        g.lineTo(P(x1), Y(y));
      }
      g.closePath();
      g.fill();
      if (kind === "cone")
        g.fillRect(P(m) - 0.6 * s, Y(y - h - 9), 1.2 * s, 10 * s);
      g.strokeStyle = RIM;
      g.lineWidth = 1.3 * s;
      g.beginPath();
      if (kind === "cone") {
        g.moveTo(P(m), Y(y - h));
        g.quadraticCurveTo(
          P(m + (x1 - x0) * 0.08),
          Y(y - h * 0.5),
          P(x1),
          Y(y),
        );
      } else {
        g.moveTo(P(x1 - inset), Y(y - h));
        g.lineTo(P(x1), Y(y));
      }
      g.stroke();
    }
    function tower(
      tx: number,
      w: number,
      top: number,
      bot: number,
      roofH: number,
      kind: "cone" | "hip",
    ) {
      const x0 = tx - w / 2;
      const x1 = tx + w / 2;
      box(x0, x1, top, bot);
      box(x0 - 3, x1 + 3, top - 2, top + 9); // machicolation gallery
      g.fillStyle = INK;
      for (let k = x0 - 2; k < x1 + 2; k += 5)
        g.fillRect(P(k), Y(top + 9), 2.4 * s, 4 * s); // corbels
      roof(x0 - 5, x1 + 5, top - 2, roofH, kind);
      rimV(x1 + 3, top - 2, top + 9);
      rimV(x1, top + 13, bot);
    }
    function windows(
      x0: number,
      x1: number,
      top: number,
      bot: number,
      cols: number,
      rows: number,
      p: number,
    ) {
      g.save();
      g.fillStyle = "#ff4a30";
      g.shadowColor = "#ff2010";
      g.shadowBlur = 8 * s;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          if (R() > p) continue;
          const wx = x0 + ((i + 0.5) * (x1 - x0)) / cols;
          const wy = top + ((j + 0.5) * (bot - top)) / rows;
          g.beginPath();
          g.moveTo(P(wx - 1.5), Y(wy + 5));
          g.lineTo(P(wx - 1.5), Y(wy - 2));
          g.lineTo(P(wx), Y(wy - 4.5));
          g.lineTo(P(wx + 1.5), Y(wy - 2));
          g.lineTo(P(wx + 1.5), Y(wy + 5));
          g.closePath();
          g.fill();
        }
      g.restore();
    }

    // the cliff
    const Hb = (H - base) / s + 20;
    const cliff: [number, number][] = [
      [-440, Hb],
      [-360, 230],
      [-335, 150],
      [-300, 95],
      [-290, 50],
      [-268, 22],
      [-250, 12],
      [-180, 8],
      [-60, 4],
      [60, 6],
      [140, 12],
      [150, 46],
      [262, 48],
      [272, 80],
      [292, 128],
      [300, 170],
      [332, 230],
      [360, 300],
      [420, Hb],
    ];
    g.fillStyle = INK;
    g.beginPath();
    cliff.forEach((p, i) => {
      const px = P(p[0] + (i && i < cliff.length - 1 ? (R() - 0.5) * 6 : 0));
      if (i) g.lineTo(px, Y(p[1]));
      else g.moveTo(px, Y(p[1]));
    });
    g.closePath();
    g.fill();
    // rock facets and the lit right face
    g.strokeStyle = "#22070b";
    g.lineWidth = 1.2 * s;
    for (let k = 0; k < 16; k++) {
      const fx = -300 + R() * 580;
      const fy = 30 + R() * 160;
      g.beginPath();
      g.moveTo(P(fx), Y(fy));
      g.lineTo(P(fx + 12 + R() * 30), Y(fy + 30 + R() * 60));
      g.stroke();
    }
    g.strokeStyle = RIM;
    g.lineWidth = 1.6 * s;
    g.beginPath();
    g.moveTo(P(262), Y(48));
    for (const p of [
      [272, 80],
      [292, 128],
      [300, 170],
      [332, 230],
      [360, 300],
    ])
      g.lineTo(P(p[0]), Y(p[1]));
    g.stroke();

    // back rank: great keep and chapel bell tower
    tower(-120, 78, -268, 8, 62, "hip");
    tower(-163, 13, -248, -222, 26, "cone");
    tower(-77, 13, -248, -222, 26, "cone"); // corner bartizans
    windows(-152, -88, -235, -30, 3, 6, 0.28);
    tower(8, 24, -232, 4, 128, "cone");
    windows(0, 16, -215, -120, 1, 3, 0.6);
    // chapel nave
    box(-44, -2, -138, 6);
    roof(-48, 2, -138, 52, "hip");
    rimV(-2, -138, 6);
    // palace wing with dormers and chimneys
    box(26, 140, -128, 12);
    roof(22, 144, -128, 54, "hip");
    rimV(140, -128, 12);
    box(52, 59, -176, -150);
    box(108, 115, -174, -150);
    for (const d of [46, 82, 118]) {
      box(d - 5, d + 5, -146, -128);
      roof(d - 7, d + 7, -146, 14, "cone");
    }
    windows(30, 136, -118, -10, 7, 3, 0.38);
    // front curtain wall, gate and the round towers
    box(-262, 150, -38, 14);
    crenels(-262, 150, -38);
    g.save();
    g.fillStyle = "#ff5a3a";
    g.shadowColor = "#ff2010";
    g.shadowBlur = 14 * s;
    g.beginPath();
    g.moveTo(P(-70), Y(14));
    g.lineTo(P(-70), Y(-6));
    g.quadraticCurveTo(P(-62), Y(-20), P(-54), Y(-6));
    g.lineTo(P(-54), Y(14));
    g.fill();
    g.restore();
    tower(-232, 42, -150, 14, 68, "cone");
    windows(-244, -220, -138, -20, 1, 4, 0.45);
    tower(118, 34, -186, 14, 60, "cone");
    windows(110, 126, -170, -40, 1, 4, 0.45);
    // lower terrace wing
    box(150, 250, -38, 50);
    roof(146, 254, -38, 36, "hip");
    rimV(250, -38, 50);
    windows(154, 246, -30, 36, 5, 2, 0.35);
    tower(258, 18, -66, 50, 34, "cone");
  }

  function tree(
    ctx: Ctx,
    x0: number,
    y0: number,
    len: number,
    ang: number,
    wid: number,
    depth: number,
    R: () => number,
  ) {
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    ctx.lineWidth = wid;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(
      x0 + Math.cos(ang + (R() - 0.5)) * len * 0.5,
      y0 + Math.sin(ang + (R() - 0.5)) * len * 0.5,
      x1,
      y1,
    );
    ctx.stroke();
    if (depth <= 0 || wid < 0.7) return;
    const n = 2 + (R() < 0.35 ? 1 : 0);
    for (let i = 0; i < n; i++)
      tree(
        ctx,
        x1,
        y1,
        len * (0.62 + R() * 0.2),
        ang + (R() - 0.5) * 1.25,
        wid * 0.62,
        depth - 1,
        R,
      );
  }

  function foreground() {
    f.clearRect(0, 0, W, H);
    f.fillStyle = INK;
    f.strokeStyle = INK;
    f.lineCap = "round";
    // low ground
    ridge(f, H * 0.975, 12, 10, INK, 41, 0.4);
    const k = Math.max(0.55, Math.min(1.1, H / 820));
    const R = rng(66);
    const wide = W > 820;
    const m = wide ? 1 : 0.6;
    tree(f, W + 10, H, 120 * k * m, -1.9, 15 * k * m, 7, R);
    tree(f, -10, H, 160 * k * m, -1.05, 16 * k * m, 7, R);
  }

  function makeFog() {
    fog.width = Math.round(W * 2 * dpr);
    fog.height = Math.round(H * dpr);
    q.setTransform(dpr, 0, 0, dpr, 0, 0);
    q.clearRect(0, 0, W * 2, H);
    const R = rng(12);
    for (let i = 0; i < 70; i++) {
      const fx = R() * W;
      const fy = base - (R() * 90 - 40) * s;
      const rx = 160 + R() * 260;
      const ry = 18 + R() * 30;
      const col = R() < 0.5 ? "255,110,95" : "120,10,20";
      const al = 0.12 + R() * 0.14;
      for (let rep = -1; rep <= 2; rep++)
        blob(q, fx + rep * W, fy, rx, ry, col, al); // tiles every W for a seamless drift
    }
  }

  function makeGrain() {
    grain.width = grain.height = 180;
    const gc = grain.getContext("2d")!;
    const id = gc.createImageData(180, 180);
    const R = rng(99);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = (R() * 255) | 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 22;
    }
    gc.putImageData(id, 0, 0);
    grainPat = x.createPattern(grain, "repeat");
  }

  function paint() {
    const r = c.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const k of [c, bg, fg]) {
      k.width = Math.round(W * dpr);
      k.height = Math.round(H * dpr);
    }
    for (const k of [g, f, x]) k.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = W > 820;
    s = wide ? Math.min(H / 780, W / 1300) : Math.min(H / 1100, W / 640);
    cx = wide ? W * 0.68 : W * 0.48;
    base = H * (wide ? 0.8 : 0.88);
    ecl = { x: cx + 218 * s, y: base - 375 * s, r: 68 * s }; // sits clear of the castle, above the low east wing

    sky();
    eclipse();
    ridge(g, base - 40 * s, 50 * s, 18, "#5c0a12", 11, 0.25);
    const haze = g.createLinearGradient(0, base - 120 * s, 0, base + 20 * s);
    haze.addColorStop(0, "rgba(230,50,35,0)");
    haze.addColorStop(1, "rgba(230,50,35,.35)");
    g.fillStyle = haze;
    g.fillRect(0, base - 120 * s, W, 140 * s);
    ridge(g, base + 10 * s, 34 * s, 16, "#2c050a", 23, 0.3);
    castle();
    foreground();
    makeFog();
    makeGrain();
  }

  const B = rng(31);
  const bats: { u: number; v: number; sp: number; ph: number; z: number }[] =
    [];
  const embers: { u: number; sp: number; ph: number; z: number; d: number }[] =
    [];
  for (let i = 0; i < 9; i++)
    bats.push({
      u: B(),
      v: B(),
      sp: 10 + B() * 18,
      ph: B() * 6,
      z: 4 + B() * 6,
    });
  for (let j = 0; j < 38; j++)
    embers.push({
      u: B(),
      sp: 18 + B() * 40,
      ph: B() * 6,
      z: 0.6 + B() * 1.6,
      d: B(),
    });

  let raf = 0;
  let stopped = false;

  function frame(ms: number) {
    const t = ms / 1000;
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
    x.drawImage(bg, 0, 0, W, H);
    // breathing glow behind the eclipse
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.7);
    const gl = x.createRadialGradient(
      ecl.x,
      ecl.y,
      ecl.r,
      ecl.x,
      ecl.y,
      ecl.r * 2.2,
    );
    gl.addColorStop(0, `rgba(255,60,40,${(0.12 + pulse * 0.12).toFixed(3)})`);
    gl.addColorStop(1, "rgba(255,60,40,0)");
    x.fillStyle = gl;
    x.fillRect(
      ecl.x - ecl.r * 2.2,
      ecl.y - ecl.r * 2.2,
      ecl.r * 4.4,
      ecl.r * 4.4,
    );
    for (const b of bats) {
      const span = ecl.r * 7;
      const bx = ecl.x - span / 2 + ((b.u * span + t * b.sp) % span);
      const by =
        ecl.y - ecl.r * 0.4 + b.v * ecl.r * 2 + Math.sin(t * 0.9 + b.ph) * 10;
      drawBat(x, bx, by, b.z * s, Math.sin(t * 11 + b.ph));
    }
    // drifting haze over the castle's feet
    const off = (t * 12) % W;
    x.globalAlpha = 0.6;
    x.drawImage(fog, -off, 0, W * 2, H);
    x.globalAlpha = 1;
    x.drawImage(fg, 0, 0, W, H);
    // embers rising
    x.globalCompositeOperation = "lighter";
    for (const e of embers) {
      const life = ((t * e.sp + e.ph * 120) % (H * 0.7)) / (H * 0.7);
      const ey = H - life * H * 0.7;
      const ex =
        e.u * W + Math.sin(t * 0.9 + e.ph) * 18 + life * 40 * (e.d - 0.5);
      x.fillStyle = `rgba(255,${(90 + e.d * 80) | 0},60,${(0.85 * (1 - life)).toFixed(3)})`;
      x.beginPath();
      x.arc(ex, ey, e.z, 0, 7);
      x.fill();
    }
    x.globalCompositeOperation = "source-over";
    // vignette and film grain
    const vg = x.createRadialGradient(
      W * 0.6,
      H * 0.5,
      Math.min(W, H) * 0.35,
      W * 0.6,
      H * 0.5,
      Math.max(W, H) * 0.8,
    );
    vg.addColorStop(0, "rgba(8,3,5,0)");
    vg.addColorStop(1, "rgba(8,3,5,.7)");
    x.fillStyle = vg;
    x.fillRect(0, 0, W, H);
    if (grainPat) {
      x.save();
      x.translate(
        still ? 0 : (Math.random() * 180) | 0,
        still ? 0 : (Math.random() * 180) | 0,
      );
      x.fillStyle = grainPat;
      x.fillRect(-180, -180, W + 360, H + 360);
      x.restore();
    }
    if (!still && !stopped && !document.hidden)
      raf = requestAnimationFrame(frame);
  }

  function boot() {
    paint();
    if (still || document.hidden) frame(1400);
  }
  function onVisibility() {
    cancelAnimationFrame(raf);
    if (!still && !stopped && !document.hidden)
      raf = requestAnimationFrame(frame);
  }

  boot();
  if (!still) raf = requestAnimationFrame(frame);
  const observer = new ResizeObserver(boot);
  observer.observe(c);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function CastleScene() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop = startScene(canvas, query.matches);
    const onChange = () => {
      stop();
      stop = startScene(canvas, query.matches);
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
      stop();
    };
  }, []);
  return <canvas ref={ref} aria-hidden="true" />;
}
