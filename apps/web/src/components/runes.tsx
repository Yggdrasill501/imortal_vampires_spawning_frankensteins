const RING = "ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ ";

// Fixed places, so the server and the browser draw the same thing.
const FLOATING = [
  { rune: "ᚠ", x: 1, y: 12, size: 2.1, time: 9, wait: 0 },
  { rune: "ᛉ", x: 4.5, y: 44, size: 1.5, time: 12, wait: 2.5 },
  { rune: "ᚱ", x: 0.5, y: 74, size: 2.6, time: 10, wait: 1.2 },
  { rune: "ᛞ", x: 5, y: 92, size: 1.3, time: 13, wait: 4 },
  { rune: "ᚦ", x: 96, y: 8, size: 1.6, time: 11, wait: 3 },
  { rune: "ᛟ", x: 98.5, y: 36, size: 2.4, time: 9.5, wait: 0.8 },
  { rune: "ᛗ", x: 95, y: 64, size: 1.4, time: 12.5, wait: 5 },
  { rune: "ᛏ", x: 98, y: 88, size: 2, time: 10.5, wait: 2 },
  { rune: "ᚹ", x: 22, y: -3, size: 1.4, time: 11.5, wait: 1.6 },
  { rune: "ᛇ", x: 48, y: -5, size: 1.9, time: 9, wait: 3.6 },
  { rune: "ᚲ", x: 76, y: -2, size: 1.3, time: 13, wait: 0.4 },
  { rune: "ᛒ", x: 30, y: 101, size: 1.7, time: 10, wait: 4.4 },
  { rune: "ᚾ", x: 66, y: 102, size: 1.4, time: 12, wait: 2.8 },
];

// These slip out from under the book and fall away. `x` is across the book, `drift` is sideways travel.
const FALLING = [
  { rune: "ᚨ", x: 9, size: 1.5, time: 7, wait: 0, drift: -2 },
  { rune: "ᛃ", x: 17, size: 2.2, time: 9, wait: 3.1, drift: 1.5 },
  { rune: "ᚷ", x: 25, size: 1.2, time: 6.5, wait: 1.4, drift: -1 },
  { rune: "ᛈ", x: 33, size: 1.8, time: 8.5, wait: 5.2, drift: 2.5 },
  { rune: "ᚺ", x: 41, size: 1.3, time: 7.5, wait: 2.3, drift: -2.5 },
  { rune: "ᛊ", x: 48, size: 2.4, time: 10, wait: 6.4, drift: 0.5 },
  { rune: "ᛚ", x: 55, size: 1.4, time: 6.8, wait: 0.7, drift: 2 },
  { rune: "ᛜ", x: 62, size: 1.9, time: 9.2, wait: 4.1, drift: -1.5 },
  { rune: "ᛖ", x: 70, size: 1.2, time: 7.2, wait: 2.9, drift: 1 },
  { rune: "ᛁ", x: 77, size: 2.1, time: 8.8, wait: 5.8, drift: -3 },
  { rune: "ᚢ", x: 84, size: 1.5, time: 6.6, wait: 1.9, drift: 2.2 },
  { rune: "ᛝ", x: 91, size: 1.7, time: 9.6, wait: 3.7, drift: -0.8 },
  { rune: "ᛡ", x: 13, size: 1.1, time: 8.2, wait: 6.9, drift: 1.8 },
  { rune: "ᛠ", x: 37, size: 1.6, time: 7.8, wait: 0.3, drift: -1.2 },
  { rune: "ᛦ", x: 59, size: 1.2, time: 8.4, wait: 4.8, drift: 2.8 },
  { rune: "ᛤ", x: 81, size: 1.3, time: 7.4, wait: 7.3, drift: -2 },
];

/** Runes adrift around the book, and more falling out from under it. Decoration only; they hold still under reduced motion. */
export function Runes() {
  return (
    <div className="runes" aria-hidden="true">
      {FLOATING.map((r) => (
        <span
          key={r.rune}
          style={{
            left: `${r.x}%`,
            top: `${r.y}%`,
            fontSize: `${r.size}rem`,
            animationDuration: `${r.time}s`,
            animationDelay: `-${r.wait}s`,
          }}
        >
          {r.rune}
        </span>
      ))}
      {FALLING.map((r) => (
        <span
          key={r.rune}
          className="falling"
          style={
            {
              left: `${r.x}%`,
              fontSize: `${r.size}rem`,
              animationDuration: `${r.time}s`,
              animationDelay: `-${r.wait}s`,
              "--drift": `${r.drift}rem`,
            } as React.CSSProperties
          }
        >
          {r.rune}
        </span>
      ))}
    </div>
  );
}

/** The circle of runes that turns slowly behind the eye. Decoration only. */
export function RuneRing() {
  return (
    <svg className="rune-ring" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <path
          id="rune-ring-path"
          d="M100 100m-88 0a88 88 0 1 1 176 0a88 88 0 1 1 -176 0"
        />
      </defs>
      <circle cx="100" cy="100" r="97" />
      <circle cx="100" cy="100" r="79" />
      <text>
        <textPath href="#rune-ring-path" textLength="548">
          {RING}
        </textPath>
      </text>
    </svg>
  );
}
