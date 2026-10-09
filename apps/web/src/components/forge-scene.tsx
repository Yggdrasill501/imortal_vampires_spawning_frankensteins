/**
 * The forge behind the working Familiars, drawn in three depths: a stone wall
 * with alcoves far back, the hearth and the tool rack in the middle, and the
 * anvil, barrel and bucket in front. Decoration only; it carries no
 * information and holds still under reduced motion.
 */
export function ForgeScene() {
  return (
    <div className="forge-scene" aria-hidden="true">
      <svg
        className="forge-art"
        viewBox="0 0 1200 340"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="forge-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a090a" stopOpacity="0" />
            <stop offset="0.45" stopColor="#1a090a" stopOpacity="0.85" />
            <stop offset="1" stopColor="#2a0c0c" />
          </linearGradient>
          <linearGradient id="forge-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a0e0c" />
            <stop offset="1" stopColor="#060303" />
          </linearGradient>
          <linearGradient id="forge-iron" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0" stopColor="#5c1712" />
            <stop offset="0.3" stopColor="#1c0a0a" />
            <stop offset="1" stopColor="#060404" />
          </linearGradient>
          <linearGradient id="forge-iron-r" x1="1" y1="0" x2="0" y2="0.4">
            <stop offset="0" stopColor="#5c1712" />
            <stop offset="0.3" stopColor="#1c0a0a" />
            <stop offset="1" stopColor="#060404" />
          </linearGradient>
          <linearGradient id="forge-brickface" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#170808" />
            <stop offset="0.5" stopColor="#2b0d0c" />
            <stop offset="1" stopColor="#0d0505" />
          </linearGradient>
          <radialGradient id="forge-fire" cx="50%" cy="100%" r="95%">
            <stop offset="0" stopColor="#ffe0b0" />
            <stop offset="0.22" stopColor="#ff7a45" />
            <stop offset="0.55" stopColor="#b3121b" />
            <stop offset="1" stopColor="#1a0204" />
          </radialGradient>
          <radialGradient id="forge-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ff5a3c" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#b3121b" stopOpacity="0.18" />
            <stop offset="1" stopColor="#b3121b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="forge-spill" cx="50%" cy="0%" r="100%">
            <stop offset="0" stopColor="#ff7a45" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ff7a45" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="forge-brick"
            width="44"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path d="M0 0h44M0 12h44M0 24h44M11 0v12M33 12v12" />
          </pattern>
          <pattern
            id="forge-stone"
            width="150"
            height="70"
            patternUnits="userSpaceOnUse"
          >
            <path d="M0 0h150M0 35h150M40 0v35M112 0v35M0 35v35M76 35v35" />
          </pattern>
        </defs>

        {/* Far: the wall, its alcoves and what hangs there */}
        <path d="M0 0h1200v322H0z" fill="url(#forge-wall)" />
        <path
          className="stone"
          d="M0 60h1200v262H0z"
          fill="url(#forge-stone)"
        />
        <g className="far">
          <path d="M470 322V150c0-36 26-60 58-60s58 24 58 60v172z" />
          <path d="M640 322V150c0-36 26-60 58-60s58 24 58 60v172z" />
          <path d="M992 322V170c0-30 22-50 48-50s48 20 48 50v152z" />
          <path d="M420 322V70h20v252zM600 322V70h20v252zM780 322V70h20v252zM1140 322V70h20v252z" />
          <path d="M400 62h780v12H400z" />
          <path d="M1010 0v62M1070 0v62M880 0v110" className="far-chain" />
          <path d="M868 110h24l6 30h-36z" />
        </g>

        <ellipse cx="215" cy="250" rx="380" ry="190" fill="url(#forge-glow)" />
        <ellipse cx="880" cy="270" rx="260" ry="110" fill="url(#forge-glow)" />

        {/* The floor, lit where the fire spills onto it */}
        <path d="M0 322h1200v18H0z" fill="url(#forge-floor)" />
        <ellipse cx="215" cy="322" rx="300" ry="16" fill="url(#forge-spill)" />
        <path className="floor" d="M0 322h1200" />

        {/* Middle: the hearth */}
        <g className="masonry">
          <path d="M150 0h130l34 100H116z" />
          <path d="M70 100h290v222H70z" />
          <path d="M52 88h326v16H52z" />
        </g>
        <path
          className="bricks"
          d="M70 104h290v218H70zM150 0h130l34 100H116z"
          fill="url(#forge-brick)"
        />
        <path
          className="mouth"
          d="M124 322v-98c0-52 40-88 91-88s91 36 91 88v98z"
          fill="url(#forge-fire)"
        />
        <g className="flames">
          <path d="M162 322c-12-36 10-56 4-88 26 22 34 48 26 88z" />
          <path d="M200 322c-16-52 16-78 8-126 36 34 48 72 34 126z" />
          <path d="M246 322c-10-32 12-50 8-76 22 20 28 44 18 76z" />
          <path d="M224 322c-6-22 8-34 6-52 14 14 18 30 12 52z" />
        </g>
        <g className="coals">
          <ellipse cx="166" cy="318" rx="22" ry="7" />
          <ellipse cx="214" cy="316" rx="30" ry="9" />
          <ellipse cx="262" cy="319" rx="20" ry="6" />
        </g>
        <path
          className="arch"
          d="M112 322v-98c0-60 46-100 103-100s103 40 103 100v98h-12v-98c0-52-40-88-91-88s-91 36-91 88v98z"
        />
        <path className="rim" d="M196 124l19-10 19 10" />
        <g className="solid">
          <path d="M352 322l-8-40h56l-8 40z" />
          <path d="M340 274h64v10h-64z" />
          <path d="M92 322l6-30h14l6 30zM116 280l46-50 9 7-46 52z" />
        </g>
        <g className="logs">
          <circle cx="364" cy="264" r="11" />
          <circle cx="386" cy="264" r="11" />
          <circle cx="375" cy="246" r="11" />
        </g>

        {/* Middle: tools on the wall */}
        <g className="solid">
          <path d="M452 96h270v9H452z" />
          <path d="M486 105h6v100h-6zM472 205h34v26h-34z" />
          <path d="M540 105h4v72l15 52h-7l-10-38-10 38h-7l15-52z" />
          <path d="M596 105h6v88h-6zM584 193h30l-6 34h-18z" />
          <path d="M650 105h4v62c15 4 22 15 22 28h-9c0-11-6-18-15-18s-15 7-15 18h-9c0-13 7-24 22-28z" />
          <path d="M700 105h5v150l-2.5 14-2.5-14z" />
        </g>
        <g className="rim">
          <path d="M452 96h270" />
          <circle cx="520" cy="130" r="13" />
          <path d="M507 130a13 13 0 0 0 26 0" />
        </g>

        {/* Front: the anvil on its stump, the hammer and the hot bar */}
        <g className="solid-r">
          <path d="M800 250h134l12 72H788z" />
        </g>
        <g className="solid">
          <path d="M724 170h204c32 0 56 9 76 26-30 2-50 11-64 26h-46c2 14 12 23 30 28H812c18-5 28-14 30-28h-22c-12-26-42-44-96-46z" />
          <path d="M826 170l-78-82 9-9 82 78z" />
          <path d="M724 60l44 42-25 25-44-42z" />
        </g>
        <path className="rim" d="M806 270h122M802 292h130M724 170h204" />
        <path className="hot" d="M882 163h92l14 7H882z" />

        {/* Front: the barrel, the bucket and the near chain */}
        <g className="solid-r">
          <path d="M1048 240h104l-12 82h-80z" />
          <path d="M1043 233h114v11h-114z" />
          <path d="M950 322c-8-30-8-66 0-96h64c8 30 8 66 0 96z" />
        </g>
        <g className="rim">
          <path d="M1052 272h96M1056 298h88" />
          <path d="M946 246h72M944 274h76M946 302h72" />
          <path d="M966 226v-34M982 226v-52M998 226v-40" />
        </g>
        <path className="chain" d="M1104 0v170" />
        <path className="rim" d="M1104 170v14c0 13 17 13 17 0" />
      </svg>
      {Array.from({ length: 14 }, (_, i) => (
        <i key={i} className="spark" />
      ))}
    </div>
  );
}
