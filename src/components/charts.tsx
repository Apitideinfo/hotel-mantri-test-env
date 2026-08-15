import { useMemo } from 'react';

interface Point {
  label: string;
  value: number;
}

interface Series {
  name: string;
  color: string;
  points: Point[];
}

// ── Line Chart ──────────────────────────────────────────────────────────────

interface LineChartProps {
  series: Series[];
  height?: number;
  yFormat?: (v: number) => string;
  showGrid?: boolean;
}

export const LineChart = ({ series, height = 200, yFormat = (v) => `${v}`, showGrid = true }: LineChartProps) => {
  const allPoints = series.flatMap((s) => s.points);
  const maxVal = Math.max(1, ...allPoints.map((p) => p.value));
  const minVal = Math.min(0, ...allPoints.map((p) => p.value));
  const range = maxVal - minVal || 1;
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const count = labels.length;
  const w = 600;
  const h = height;
  const padL = 50;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xFor = (i: number) => padL + (count > 1 ? (i / (count - 1)) * plotW : 0);
  const yFor = (v: number) => padT + plotH - ((v - minVal) / range) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + plotH * (1 - f);
    return { y, label: yFormat(minVal + range * f) };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMid meet">
      {showGrid && gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 3" />
          <text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{g.label}</text>
        </g>
      ))}
      {labels.map((lbl, i) => (
        <text key={i} x={xFor(i)} y={h - 8} textAnchor="middle" fontSize={9} fill="#94a3b8">
          {count > 12 && i % Math.ceil(count / 8) !== 0 ? '' : lbl}
        </text>
      ))}
      {series.map((s, si) => {
        const path = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ');
        const areaPath = path + ` L ${xFor(s.points.length - 1)} ${padT + plotH} L ${xFor(0)} ${padT + plotH} Z`;
        return (
          <g key={si}>
            <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p, i) => (
              <circle key={i} cx={xFor(i)} cy={yFor(p.value)} r={3} fill="white" stroke={s.color} strokeWidth={2} />
            ))}
          </g>
        );
      })}
    </svg>
  );
};

// ── Area Chart (single series with gradient fill) ────────────────────────────

interface AreaChartProps {
  points: Point[];
  color?: string;
  height?: number;
  yFormat?: (v: number) => string;
}

export const AreaChart = ({ points, color = '#2563eb', height = 200, yFormat = (v) => `${v}` }: AreaChartProps) => {
  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const minVal = Math.min(0, ...points.map((p) => p.value));
  const range = maxVal - minVal || 1;
  const count = points.length;
  const w = 600;
  const h = height;
  const padL = 50;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xFor = (i: number) => padL + (count > 1 ? (i / (count - 1)) * plotW : 0);
  const yFor = (v: number) => padT + plotH - ((v - minVal) / range) * plotH;
  const gid = useMemo(() => `area-grad-${Math.random().toString(36).slice(2, 8)}`, []);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ');
  const areaPath = path + ` L ${xFor(count - 1)} ${padT + plotH} L ${xFor(0)} ${padT + plotH} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + plotH * (1 - f);
    return { y, label: yFormat(minVal + range * f) };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 3" />
          <text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{g.label}</text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={i} x={xFor(i)} y={h - 8} textAnchor="middle" fontSize={9} fill="#94a3b8">
          {count > 12 && i % Math.ceil(count / 8) !== 0 ? '' : p.label}
        </text>
      ))}
      <path d={areaPath} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(p.value)} r={3} fill="white" stroke={color} strokeWidth={2} />
      ))}
    </svg>
  );
};

// ── Bar Chart ────────────────────────────────────────────────────────────────

interface BarChartProps {
  points: Point[];
  color?: string;
  height?: number;
  horizontal?: boolean;
  yFormat?: (v: number) => string;
}

export const BarChart = ({ points, color = '#2563eb', height = 200, horizontal = false, yFormat = (v) => `${v}` }: BarChartProps) => {
  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const count = points.length;

  if (horizontal) {
    const rowH = 28;
    const w = 600;
    const h = Math.max(height, count * rowH + 20);
    const padL = 100;
    const padR = 50;
    const padT = 8;
    const padB = 8;
    const plotW = w - padL - padR;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="xMidYMid meet">
        {points.map((p, i) => {
          const barW = (p.value / maxVal) * plotW;
          const y = padT + i * rowH;
          return (
            <g key={i}>
              <text x={padL - 8} y={y + rowH / 2 + 3} textAnchor="end" fontSize={10} fill="#475569" fontWeight={500}>
                {p.label.length > 14 ? p.label.slice(0, 13) + '…' : p.label}
              </text>
              <rect x={padL} y={y + 4} width={Math.max(2, barW)} height={rowH - 8} rx={4} fill={color} opacity={0.85} />
              <text x={padL + barW + 6} y={y + rowH / 2 + 3} fontSize={10} fill="#475569" fontWeight={600}>
                {yFormat(p.value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const w = 600;
  const h = height;
  const padL = 50;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const barW = count > 0 ? (plotW / count) * 0.6 : 0;
  const gap = count > 0 ? (plotW / count) * 0.4 : 0;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + plotH * (1 - f);
    return { y, label: yFormat(maxVal * f) };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMid meet">
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 3" />
          <text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{g.label}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const barH = (p.value / maxVal) * plotH;
        const x = padL + i * (barW + gap) + gap / 2;
        const y = padT + plotH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(0, barH)} rx={3} fill={color} opacity={0.85} />
            <text x={x + barW / 2} y={h - 10} textAnchor="middle" fontSize={9} fill="#94a3b8">
              {count > 12 && i % Math.ceil(count / 8) !== 0 ? '' : p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Donut Chart ──────────────────────────────────────────────────────────────

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}

export const DonutChart = ({ slices, size = 180, centerLabel, centerValue }: DonutChartProps) => {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  const radius = size / 2 - 10;
  const innerRadius = radius * 0.62;
  const cx = size / 2;
  const cy = size / 2;

  let angle = -Math.PI / 2;

  const arcs = slices.map((sl) => {
    const frac = total > 0 ? sl.value / total : 0;
    const sweep = frac * Math.PI * 2;
    const startAngle = angle;
    const endAngle = angle + sweep;
    angle = endAngle;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const x3 = cx + innerRadius * Math.cos(endAngle);
    const y3 = cy + innerRadius * Math.sin(endAngle);
    const x4 = cx + innerRadius * Math.cos(startAngle);
    const y4 = cy + innerRadius * Math.sin(startAngle);
    const largeArc = sweep > Math.PI ? 1 : 0;

    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
    return { path, ...sl, pct: frac * 100 };
  });

  return (
    <div className="flex items-center gap-4 flex-wrap justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={radius - innerRadius} />
        ) : (
          arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} />)
        )}
        {centerValue && (
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={16} fontWeight={700} fill="#0f172a">{centerValue}</text>
        )}
        {centerLabel && (
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight={600}>{centerLabel}</text>
        )}
      </svg>
      <div className="space-y-1.5">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-slate-600 font-medium">{s.label}</span>
            <span className="text-slate-900 font-bold tabular-nums ml-auto">
              {total > 0 ? `${(s.value / total * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Sparkline (tiny inline trend) ─────────────────────────────────────────────

interface SparklineProps {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const Sparkline = ({ values, color = '#2563eb', width = 80, height = 24 }: SparklineProps) => {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const path = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="inline-block">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Grouped Bar Chart (for comparisons) ──────────────────────────────────────

interface GroupedBarChartProps {
  groups: { label: string; bars: { name: string; value: number; color: string }[] }[];
  height?: number;
  yFormat?: (v: number) => string;
}

export const GroupedBarChart = ({ groups, height = 220, yFormat = (v) => `${v}` }: GroupedBarChartProps) => {
  const allVals = groups.flatMap((g) => g.bars.map((b) => b.value));
  const maxVal = Math.max(1, ...allVals);
  const w = 600;
  const h = height;
  const padL = 50;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const groupCount = groups.length;
  const groupW = plotW / Math.max(1, groupCount);
  const barCount = groups[0]?.bars.length ?? 1;
  const barW = (groupW * 0.7) / Math.max(1, barCount);
  const gap = groupW * 0.15;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + plotH * (1 - f);
    return { y, label: yFormat(maxVal * f) };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMid meet">
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 3" />
            <text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{g.label}</text>
          </g>
        ))}
        {groups.map((g, gi) => {
          const groupX = padL + gi * groupW + gap;
          return (
            <g key={gi}>
              {g.bars.map((b, bi) => {
                const barH = (b.value / maxVal) * plotH;
                const x = groupX + bi * barW;
                const y = padT + plotH - barH;
                return <rect key={bi} x={x} y={y} width={barW * 0.9} height={Math.max(0, barH)} rx={2} fill={b.color} opacity={0.85} />;
              })}
              <text x={groupX + (groupW - 2 * gap) / 2} y={h - 22} textAnchor="middle" fontSize={9} fill="#475569" fontWeight={500}>
                {g.label.length > 10 ? g.label.slice(0, 9) + '…' : g.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {groups[0]?.bars.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-sm" style={{ background: b.color }} />
            <span className="text-slate-600">{b.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
