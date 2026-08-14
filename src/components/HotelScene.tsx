/**
 * Original animated luxury hotel scene — pure SVG + CSS.
 * No external assets, no JS animation libraries.
 */

export const HotelScene = () => {
  const bars = [0.4, 0.65, 0.5, 0.8, 0.6, 0.95];
  return (
    <svg viewBox="0 0 500 520" className="w-full h-full" aria-hidden="true">
      <defs>
        <linearGradient id="hotelBldg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0f1e35" />
        </linearGradient>
        <linearGradient id="hotelTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a4a73" />
          <stop offset="100%" stopColor="#1e3a5f" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="laptopScreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="receptionTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b5378" />
          <stop offset="100%" stopColor="#1e3a5f" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
          <feOffset dx="0" dy="3" result="off" />
          <feComponentTransfer><feFuncA type="linear" slope="0.3" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Ambient glow */}
      <circle cx="250" cy="260" r="200" fill="url(#glow)" />

      {/* Clouds */}
      <g className="cloud-drift" opacity="0.15">
        <ellipse cx="120" cy="70" rx="40" ry="12" fill="#fff" />
        <ellipse cx="140" cy="65" rx="28" ry="10" fill="#fff" />
      </g>
      <g className="cloud-drift-2" opacity="0.12">
        <ellipse cx="380" cy="90" rx="35" ry="11" fill="#fff" />
        <ellipse cx="395" cy="85" rx="22" ry="8" fill="#fff" />
      </g>

      {/* Stars / dots */}
      {[[60,40],[430,30],[470,60],[80,100],[440,120],[30,150]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r="1.5" fill="#93c5fd" opacity="0.5" />
      ))}

      {/* Hotel building */}
      <g filter="url(#softShadow)">
        {/* Main body */}
        <rect x="150" y="120" width="200" height="280" rx="6" fill="url(#hotelBldg)" />
        {/* Top crown */}
        <rect x="140" y="110" width="220" height="20" rx="4" fill="url(#hotelTop)" />
        {/* Antenna */}
        <line x1="250" y1="110" x2="250" y2="88" stroke="#475569" strokeWidth="2" />
        <circle cx="250" cy="86" r="3" fill="#fbbf24" />
        {/* Windows grid */}
        {[0,1,2,3,4].map(row =>
          [0,1,2,3].map(col => {
            const x = 170 + col * 42;
            const y = 150 + row * 42;
            const lit = (row + col) % 3 === 0;
            return (
              <rect key={`${row}-${col}`} x={x} y={y} width="26" height="28" rx="3"
                fill={lit ? '#fbbf24' : '#1c2f4d'}
                opacity={lit ? 0.85 : 0.5}
                style={{ animation: lit ? `window-blink ${2 + (row*0.3)}s ease-in-out ${col*0.2}s infinite` : 'none' }} />
            );
          })
        )}
        {/* Hotel sign */}
        <rect x="195" y="405" width="110" height="24" rx="4" fill="#0f1e35" stroke="url(#goldGrad)" strokeWidth="1.5" />
        <text x="250" y="421" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fbbf24" letterSpacing="1">HOTEL MANTRI</text>
        {/* Entrance */}
        <rect x="220" y="365" width="60" height="35" rx="3" fill="#0a1525" />
        <rect x="224" y="369" width="52" height="27" rx="2" fill="#1e3a5f" />
        <line x1="250" y1="369" x2="250" y2="396" stroke="#fbbf24" strokeWidth="1" opacity="0.5" />
      </g>

      {/* Reception counter (bottom left) */}
      <g filter="url(#softShadow)">
        <rect x="40" y="360" width="120" height="60" rx="6" fill="url(#receptionTop)" />
        <rect x="36" y="352" width="128" height="12" rx="4" fill="#475569" />
        {/* Bell */}
        <g className="bell-pulse" style={{ transformOrigin: '100px 345px' }}>
          <path d="M 88 348 Q 100 336 112 348 L 112 352 L 88 352 Z" fill="url(#goldGrad)" />
          <circle cx="100" cy="338" r="3" fill="#fbbf24" />
        </g>
        {/* Laptop on counter */}
        <g className="dash-slide">
          <rect x="55" y="338" width="42" height="26" rx="2" fill="#1e293b" stroke="#475569" strokeWidth="1" />
          <rect x="58" y="341" width="36" height="20" rx="1" fill="url(#laptopScreen)" />
          {/* Mini graph on laptop */}
          {bars.map((h, i) => (
            <rect key={i} x={60 + i * 5.5} y={356 - h * 12} width="3.5" height={h * 12} rx="1"
              fill="#3b82f6"
              style={{ transformOrigin: `bottom`, animation: `graph-bar ${1.5 + i * 0.2}s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
          <rect x="48" y="362" width="56" height="3" rx="1" fill="#334155" />
        </g>
      </g>

      {/* Floating key card (right) */}
      <g className="key-float">
        <rect x="370" y="280" width="80" height="50" rx="8" fill="#1e293b" stroke="#3b82f6" strokeWidth="1.5" opacity="0.95" />
        <rect x="378" y="290" width="40" height="6" rx="2" fill="#3b82f6" opacity="0.6" />
        <rect x="378" y="302" width="28" height="4" rx="1.5" fill="#475569" />
        <rect x="378" y="310" width="20" height="4" rx="1.5" fill="#475569" />
        {/* Key icon */}
        <circle cx="438" cy="305" r="6" fill="none" stroke="#fbbf24" strokeWidth="2" />
        <line x1="438" y1="311" x2="438" y2="320" stroke="#fbbf24" strokeWidth="2" />
        <line x1="435" y1="316" x2="441" y2="316" stroke="#fbbf24" strokeWidth="2" />
      </g>

      {/* Floating room card 1 (top right) */}
      <g className="room-card-float">
        <rect x="360" y="150" width="90" height="56" rx="8" fill="rgba(30,58,95,0.85)" stroke="#3b82f6" strokeWidth="1" opacity="0.9" />
        <rect x="368" y="158" width="50" height="6" rx="2" fill="#60a5fa" />
        <rect x="368" y="170" width="74" height="4" rx="1.5" fill="#334155" />
        <rect x="368" y="178" width="60" height="4" rx="1.5" fill="#334155" />
        <rect x="368" y="190" width="30" height="8" rx="3" fill="#10b981" opacity="0.7" />
      </g>

      {/* Floating room card 2 (left mid) */}
      <g className="room-card-float-2">
        <rect x="30" y="200" width="85" height="52" rx="8" fill="rgba(30,58,95,0.8)" stroke="#3b82f6" strokeWidth="1" opacity="0.85" />
        <rect x="38" y="208" width="45" height="6" rx="2" fill="#60a5fa" />
        <rect x="38" y="220" width="68" height="4" rx="1.5" fill="#334155" />
        <rect x="38" y="228" width="55" height="4" rx="1.5" fill="#334155" />
        <rect x="38" y="238" width="28" height="8" rx="3" fill="#f59e0b" opacity="0.7" />
      </g>

      {/* Notification icon (top left area) */}
      <g className="notif-bounce">
        <rect x="55" y="115" width="36" height="36" rx="10" fill="rgba(30,58,95,0.9)" stroke="#3b82f6" strokeWidth="1" />
        <path d="M 68 140 Q 68 130 73 130 Q 78 130 78 135 L 78 138 L 80 140 L 66 140 L 68 138 Z" fill="#fbbf24" />
        <circle cx="73" cy="128" r="3" fill="#fbbf24" />
        <circle cx="82" cy="120" r="4" fill="#ef4444" />
        <text x="82" y="123" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fff">3</text>
      </g>

      {/* Calendar icon (bottom right) */}
      <g className="room-card-float">
        <rect x="380" y="400" width="40" height="40" rx="8" fill="rgba(30,58,95,0.9)" stroke="#3b82f6" strokeWidth="1" />
        <rect x="385" y="406" width="30" height="3" rx="1" fill="#60a5fa" />
        <rect x="385" y="412" width="6" height="6" rx="1" fill="#334155" />
        <rect x="393" y="412" width="6" height="6" rx="1" fill="#334155" />
        <rect x="401" y="412" width="6" height="6" rx="1" fill="#fbbf24" />
        <rect x="385" y="420" width="6" height="6" rx="1" fill="#334155" />
        <rect x="393" y="420" width="6" height="6" rx="1" fill="#334155" />
        <rect x="401" y="420" width="6" height="6" rx="1" fill="#334155" />
      </g>

      {/* Occupancy indicator (bottom center) */}
      <g>
        <circle cx="250" cy="470" r="36" fill="none" stroke="#1e293b" strokeWidth="5" />
        <circle cx="250" cy="470" r="36" fill="none" stroke="#10b981" strokeWidth="5"
          strokeLinecap="round" strokeDasharray="226"
          className="occupancy-ring"
          transform="rotate(-90 250 470)" />
        <text x="250" y="468" textAnchor="middle" fontSize="13" fontWeight="700" fill="#10b981">73%</text>
        <text x="250" y="480" textAnchor="middle" fontSize="7" fill="#64748b" letterSpacing="0.5">OCCUPANCY</text>
      </g>

      {/* Small luggage (bottom left) */}
      <g opacity="0.7">
        <rect x="180" y="440" width="40" height="28" rx="3" fill="#1e293b" stroke="#475569" strokeWidth="1" />
        <rect x="190" y="434" width="20" height="6" rx="2" fill="none" stroke="#475569" strokeWidth="1.5" />
        <line x1="200" y1="440" x2="200" y2="468" stroke="#334155" strokeWidth="1" />
      </g>
    </svg>
  );
};
