// 2D line-art world for the landing-page camera: a thin-film algae bioreactor with sensing and cloud
// connectivity, drawn in the same quiet botanical style as the team-card leaf. 1500 × 1000 (3:2), the aspect
// useStoryMotion expects. Camera focus points for each chapter live in src/animation/airCamera.ts.

// Leaf sprig from components/Botanical.tsx (viewBox 320 × 365).
function Sprig({ transform, opacity = 1 }: { transform: string; opacity?: number }) {
  return <g transform={transform} opacity={opacity}>
    <path d="M153 352c-23-91 41-170 19-261M164 257C114 244 70 206 56 147M172 215c41-33 80-68 86-119M162 170c-37-17-60-40-72-81M174 130c31-25 44-54 42-94" className="ink" strokeWidth="2"/>
    <g className="leaf">
      <path d="M164 250C92 257 63 208 57 158c55 13 88 36 107 92Z"/><path d="M174 210c-8-64 42-96 79-107-2 53-22 93-79 107Z"/>
      <path d="M167 170C119 174 92 124 87 92c42 8 72 34 80 78Z"/><path d="M175 130c-5-45 16-72 42-90 14 53-15 85-42 90Z"/>
      <path d="M160 303c-13-62-63-87-101-84 12 41 59 74 101 84Z"/><path d="M156 296c9-49 45-77 91-74-11 40-53 72-91 74Z"/>
      <path d="M172 94c-22-36-18-64-8-85 26 18 41 50 8 85Z"/>
    </g>
    <path d="m59 162 99 83m22-43 70-92m-81 52L92 99m87 26 33-75m-54 248-93-71m95 64 79-62" className="ink faint"/>
  </g>
}

// Small algae stem growing in the tank.
function Algae({ x, height }: { x: number; height: number }) {
  const base = 846, top = base - height
  const leaves = [0.3, 0.52, 0.74].map((f, i) => {
    const y = base - height * f, side = i % 2 ? 1 : -1
    return `M${x} ${y}c${side * 9} -3 ${side * 15} -10 ${side * 16} -19c${-side * 10} 1 ${-side * 15} 9 ${-side * 16} 19Z`
  })
  return <g>
    <path d={`M${x} ${base}C${x - 6} ${base - height * .45} ${x + 6} ${base - height * .7} ${x} ${top}`} className="ink thin"/>
    {leaves.map(d => <path key={d} d={d} className="algae-leaf"/>)}
  </g>
}

const tankAlgae = [[938, 80], [1004, 58], [1112, 74], [1140, 50]] as const

export default function BioreactorScene({ className = '' }: { className?: string }) {
  return <svg className={`bioreactor-scene ${className}`} viewBox="0 0 1500 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="air-treated" gradientUnits="userSpaceOnUse" x1="1004" y1="470" x2="1120" y2="690">
        <stop offset="0" stopColor="#94826f"/><stop offset=".55" stopColor="#6f9372"/><stop offset="1" stopColor="#4f8790"/>
      </linearGradient>
      <clipPath id="tank-water"><rect x="848" y="702" width="304" height="146" rx="5"/></clipPath>
    </defs>

    {/* Ground, light, and framing leaves */}
    <rect width="1500" height="1000" className="scene-ground"/>
    <circle cx="330" cy="250" r="96" className="scene-sun"/>
    <ellipse cx="1000" cy="893" rx="360" ry="13" className="scene-shadow"/>
    <path d="M40 893H1460" className="ink faint"/>
    <Sprig transform="translate(70 380) rotate(-8 160 180) scale(1.55)" opacity={.55}/>
    <Sprig transform="translate(1495 560) scale(-1.05 1.05)" opacity={.5}/>

    {/* Cloud and dashboard (chapter 5) */}
    <g className="scene-cloud">
      <path d="M936 168h168a36 36 0 0 0 4-72 52 52 0 0 0-98-20 38 38 0 0 0-62 30 32 32 0 0 0-12 62Z" className="panel"/>
      <path d="M1020 152v-36m-14 14 14-14 14 14" className="ink thin"/>
      <path d="M990 144h-10m80 0h-10" className="ink faint"/>
    </g>
    <path d="M866 203C880 180 905 172 930 168" className="signal-line"/>
    <path d="M1106 128C1150 122 1184 126 1224 138" className="signal-line"/>
    <g className="scene-phone">
      <rect x="1226" y="84" width="70" height="118" rx="11" className="panel"/>
      <rect x="1236" y="100" width="50" height="78" rx="4" className="screen"/>
      <path d="M1240 160l9-8 8 4 9-14 8 6 8-10" className="ink thin teal"/>
      <path d="M1242 122h18m-18 9h28" className="ink faint"/>
      <path d="M1254 190h14" className="ink thin"/>
    </g>

    {/* Cabinet */}
    <rect x="820" y="330" width="360" height="545" rx="16" className="cabinet"/>
    <rect x="834" y="344" width="332" height="517" rx="8" className="ink faint"/>
    <path d="M852 875h36v9h-36zM1112 875h36v9h-36z" className="foot"/>

    {/* LoRa antenna and radio waves */}
    <path d="M858 330v-26l9-5-18-7 18-7-18-7 18-7-18-7 9-5v-56" className="ink"/>
    <circle cx="858" cy="200" r="5" className="node-dot"/>
    <g className="radio-waves">
      <path d="M872 186a20 20 0 0 1 0 28" className="ink thin teal"/>
      <path d="M882 176a34 34 0 0 1 0 48" className="ink thin teal"/>
      <path d="M892 166a48 48 0 0 1 0 68" className="ink thin teal"/>
    </g>

    {/* BME680 sensor on top */}
    <rect x="930" y="300" width="104" height="30" rx="5" className="sensor"/>
    <path d="M944 308v14m10-14v14m10-14v14m10-14v14m10-14v14m10-14v14m10-14v14" className="ink faint"/>
    <g className="sense-dots"><circle cx="958" cy="286" r="2.5"/><circle cx="982" cy="278" r="2.5"/><circle cx="1006" cy="286" r="2.5"/></g>

    {/* Polluted air drawn in through the fan */}
    <g className="air-in">
      <path d="M548 404C650 392 760 420 850 440"/><path d="M528 456C640 452 750 454 850 455"/><path d="M548 508C650 516 760 490 850 470"/>
    </g>
    <path d="M838 432l14 9-14 6M838 449l14 6-14 6M838 466l14 5-15 4" className="ink thin warm"/>

    {/* Air suction fan behind a fine mesh */}
    <circle cx="930" cy="455" r="76" className="panel"/>
    <g className="fan-blades">
      <path d="M930 455c-6-22 4-42 22-50 8 18 0 38-22 50Zm0 0c22-6 42 4 50 22-18 8-38 0-50-22Zm0 0c6 22-4 42-22 50-8-18 0-38 22-50Zm0 0c-22 6-42-4-50-22 18-8 38 0 50 22Z" className="leaf"/>
    </g>
    <g className="ink faint"><circle cx="930" cy="455" r="22"/><circle cx="930" cy="455" r="36"/><circle cx="930" cy="455" r="50"/><circle cx="930" cy="455" r="62"/>
      <path d="M930 393v124M868 455h124M886 411l88 88M974 411l-88 88"/></g>
    <circle cx="930" cy="455" r="66" className="ink"/>
    <circle cx="930" cy="455" r="9" className="hub"/>
    <g className="bolt"><circle cx="877" cy="402" r="3"/><circle cx="983" cy="402" r="3"/><circle cx="877" cy="508" r="3"/><circle cx="983" cy="508" r="3"/></g>

    {/* Algae tank */}
    <rect x="846" y="700" width="308" height="150" rx="6" className="tank"/>
    <g clipPath="url(#tank-water)">
      <path d="M846 742q19-7 38 0t38 0 38 0 38 0 38 0 38 0 38 0 38 0 38 0V852H846Z" className="water"/>
      {tankAlgae.map(([x, h]) => <Algae key={x} x={x} height={h}/>)}
    </g>
    <path d="M846 742q19-7 38 0t38 0 38 0 38 0 38 0 38 0 38 0 38 0 38 0" className="ink thin"/>

    {/* Pump and hose lifting algae water */}
    <rect x="862" y="812" width="46" height="30" rx="5" className="pump"/>
    <path d="M869 820h32m-32 8h32" className="ink faint"/>
    <path d="M885 812V610q0-44 40-44h4q10 0 12 10" className="hose"/>
    <path d="M885 806V612q0-38 36-38" className="hose-flow"/>

    {/* Thin-film panel: algae water released from the hose runs down the incline */}
    <path d="M925 590L1075 790L1089 779L939 579Z" className="panel"/>
    <path d="M929 588L1077 786L1084 781L936 583Z" className="film"/>
    <path d="M933 586L1080 782" className="film-flow"/>
    <g className="drops"><circle cx="941" cy="584" r="3"/><circle cx="944" cy="592" r="2.2"/></g>

    {/* Air passes over the film towards the column */}
    <path d="M1004 470C1048 522 1028 604 1056 652C1070 680 1096 690 1120 688" className="air-over"/>
    <path d="M1004 470C1048 522 1028 604 1056 652C1070 680 1096 690 1120 688" className="air-over-flow"/>

    {/* Filter column with base fan, rising air, and the oxygen outlet */}
    <rect x="1082" y="372" width="76" height="312" rx="6" className="panel"/>
    <rect x="1088" y="384" width="12" height="288" rx="3" className="media"/>
    <rect x="1140" y="384" width="12" height="288" rx="3" className="media"/>
    <path d="M1090 400h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8M1142 410h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8m-8 20h8" className="ink faint"/>
    <rect x="1105" y="380" width="30" height="296" rx="14" className="tube"/>
    <path d="M1120 674C1134 652 1106 630 1120 606S1134 560 1120 536 1106 490 1120 466 1134 420 1120 392" className="swirl"/>
    <path d="M1120 674C1106 652 1134 630 1120 606S1106 560 1120 536 1134 490 1120 466 1106 420 1120 392" className="swirl swirl-b"/>
    <ellipse cx="1120" cy="688" rx="26" ry="7" className="hub"/>
    <rect x="1110" y="334" width="20" height="40" className="tube"/>
    <rect x="1104" y="288" width="32" height="44" rx="3" className="outlet"/>
    <ellipse cx="1120" cy="288" rx="16" ry="4" className="ink thin"/>
    <g className="oxygen">
      <path d="M1112 278c-12-18 8-30-3-48s6-20 0-30"/><path d="M1122 278c9-18-9-30 3-48s-5-20 2-32"/><path d="M1131 278c-8-18 12-30 2-50"/>
    </g>
    <g className="o2-bubbles"><circle cx="1104" cy="250" r="4"/><circle cx="1138" cy="236" r="5"/><circle cx="1118" cy="214" r="3.5"/></g>
  </svg>
}
