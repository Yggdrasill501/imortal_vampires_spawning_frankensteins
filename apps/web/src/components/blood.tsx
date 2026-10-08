"use client";

import { useEffect, type RefObject } from "react";

/**
 * The reference's blood spill: liquid (a sheet plus drip fingers) run through
 * a gooey, wet-sheen filter, clipped inside a blood button. It runs down on
 * hover or focus and fades on leave. Instant under reduced motion.
 */

const NS = "http://www.w3.org/2000/svg";

/** The filter and fill every spill uses. Rendered once, in the app frame. */
export function SpillDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      style={{ position: "absolute" }}
    >
      <filter
        id="goo3"
        filterUnits="userSpaceOnUse"
        x="-40"
        y="-40"
        width="3000"
        height="3000"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
        <feColorMatrix
          in="b"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11"
          result="goo"
        />
        <feGaussianBlur in="goo" stdDeviation="1.35" result="soft" />
        <feSpecularLighting
          in="soft"
          surfaceScale="2.7"
          specularConstant="1.1"
          specularExponent="34"
          lightingColor="#ffc9c4"
          result="spec"
        >
          <feDistantLight azimuth="225" elevation="32" />
        </feSpecularLighting>
        <feComposite in="spec" in2="goo" operator="in" result="shine" />
        <feComposite
          in="goo"
          in2="shine"
          operator="arithmetic"
          k1="0"
          k2="1"
          k3=".42"
          k4="0"
        />
      </filter>
      <linearGradient id="bloodfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#260003" />
        <stop offset=".6" stopColor="#3f0105" />
        <stop offset="1" stopColor="#55030a" />
      </linearGradient>
    </svg>
  );
}

let salt = 613;
function rand() {
  salt = (salt * 1664525 + 1013904223) >>> 0;
  return salt / 4294967296;
}

/** Attaches the spill to the `.blood-svg` inside the element `ref` points at. */
export function useBloodSpill(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    const svg = el?.querySelector<SVGSVGElement>(".blood-svg");
    const grp = svg?.querySelector<SVGGElement>("g");
    if (!el || !svg || !grp || !enabled) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sheet = document.createElementNS(NS, "path");
    grp.appendChild(sheet);
    const fingers = Array.from({ length: 6 }, (_, i) => {
      const body = document.createElementNS(NS, "rect");
      const head = document.createElementNS(NS, "circle");
      const bead = document.createElementNS(NS, "circle");
      grp.append(body, head, bead);
      return {
        u: (i + 0.15 + rand() * 0.7) / 6,
        w: 3.4 + rand() * 3.4,
        k: 1.08 + rand() * rand() * 0.7,
        drop: rand() < 0.45,
        body,
        head,
        bead,
      };
    });
    const ph = rand() * 9;
    let p = 0;
    let on = false;
    let leftAt = 0;
    let last = 0;
    let raf = 0;
    let running = false;

    function draw(t: number) {
      const W = el!.clientWidth;
      const H = el!.clientHeight;
      const e = p * p * (3 - 2 * p); // gravity-ish ease
      const lead = e * (H + 30) - 18; // sheet front
      const amp = 2.2 * (1 - e * 0.6);
      let d = `M-20 -40 H${W + 20} V${lead.toFixed(1)}`;
      for (let x = W + 20; x >= -20; x -= 6) {
        const y =
          lead +
          Math.sin(x * 0.045 + t * 2.6 + ph) * amp +
          Math.sin(x * 0.13 - t * 1.7) * amp * 0.5;
        d += ` L${x} ${y.toFixed(1)}`;
      }
      sheet.setAttribute("d", `${d}Z`);
      for (const f of fingers) {
        const fx = f.u * W;
        const tip =
          lead +
          e * (1 - e * 0.5) * H * (f.k - 1) * 2.2 +
          Math.sin(t * 1.3 + f.u * 9) * 1.5;
        const r = f.w * 0.72;
        f.body.setAttribute("x", (fx - f.w / 2).toFixed(1));
        f.body.setAttribute("y", "-40");
        f.body.setAttribute("width", f.w.toFixed(1));
        f.body.setAttribute("height", Math.max(0, tip + 40).toFixed(1));
        f.head.setAttribute("cx", fx.toFixed(1));
        f.head.setAttribute("cy", tip.toFixed(1));
        f.head.setAttribute("r", (r * Math.min(1, e * 3)).toFixed(1));
        const gap = f.drop ? r * (1.6 + Math.sin(t * 2 + f.u * 5) * 0.3) : 0;
        f.bead.setAttribute("cx", fx.toFixed(1));
        f.bead.setAttribute("cy", (tip + gap).toFixed(1));
        f.bead.setAttribute(
          "r",
          f.drop ? (r * 0.62 * Math.min(1, e * 2.5)).toFixed(1) : "0",
        );
      }
    }
    function tick(ms: number) {
      const dt = Math.min(0.05, (ms - (last || ms)) / 1000);
      last = ms;
      if (still) p = on ? 1 : 0;
      else if (on) p = Math.min(1, p + dt / 0.8);
      if (!on && leftAt && ms - leftAt > 380) {
        p = 0;
        leftAt = 0;
      }
      if (on || leftAt) {
        draw(ms / 1000);
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
        last = 0;
      }
    }
    function kick() {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    }
    function enter() {
      if ((el as HTMLButtonElement).disabled) return;
      on = true;
      leftAt = 0;
      svg!.classList.add("on");
      kick();
    }
    function leave() {
      if (!on) return;
      on = false;
      leftAt = performance.now();
      svg!.classList.remove("on");
      kick();
    }
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focusin", enter);
    el.addEventListener("focusout", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focusin", enter);
      el.removeEventListener("focusout", leave);
      svg.classList.remove("on");
      grp.replaceChildren();
    };
  }, [ref, enabled]);
}
