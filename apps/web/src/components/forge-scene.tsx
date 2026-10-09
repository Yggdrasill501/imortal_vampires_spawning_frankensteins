/**
 * The forge behind the working Familiars: a low fire, an anvil and a few
 * sparks. Decoration only; it carries no information and holds still under
 * reduced motion.
 */
export function ForgeScene() {
  return (
    <div className="forge-scene" aria-hidden="true">
      <svg viewBox="0 0 240 120" className="anvil">
        <path d="M18 34h150c22 0 40 6 54 18-20 2-36 8-46 18h-34c2 14 10 22 24 26v10H62V96c14-4 22-12 24-26H70C60 50 42 40 18 40z" />
      </svg>
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className="spark" />
      ))}
    </div>
  );
}
