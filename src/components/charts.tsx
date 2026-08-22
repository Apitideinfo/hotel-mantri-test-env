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

export interface LineChartProps {
  series: Series[];
  height?: number;
  yFormat?: (v: number) => string;
  showGrid?: boolean;
}

export const LineChart = ({ series, height = 230, yFormat = (v: number) => `${v}`, showGrid = true }: LineChartProps) => {
  const allPoints = series.flatMap((s: Series) => s.points);
  const rawMax = Math.max(1, ...allPoints.map((p: Point) => p.value));
  const maxVal = Math.ceil(rawMax * 1.15);
  const minVal = 0;
  const range = maxVal - minVal || 1;
  const labels = series[0]?.points.map((p: Point) => p.label) ?? [];

  const count = labels.length;
  const w = 420;
  const h = height;
  const padL = 75;
  const padR = 20;
  const padT = 28;
  const padB = 38;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xFor = (i: number) => padL + (count > 1 ? (i / (count - 1)) * plotW : plotW / 2);
  const yFor = (v: number) => padT + plotH - ((v - minVal) / range) * plotH;

  const gridLines = [0, 0.33, 0.66, 1].map((f) => {
    const y = padT + plotH * (1 - f);
    return { y, label: yFormat(Math.round(minVal + range * f)) };
  });

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Series Legend at top right */}
      {series.length > 1 && (
        <div className="flex items-center justify-end gap-4 px-2 -mb-1">
          {series.map((s: Series, i: number) => (
            <div key={i} className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      )}

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible" preserveAspectRatio="xMidYMid meet">
        <defs>
          {series.map((s: Series, si: number) => (
            <linearGradient key={si} id={`line-grad-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.0} />
            </linearGradient>
          ))}
        </defs>

        {showGrid && gridLines.map((g, i: number) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 4" />
            <text x={padL - 10} y={g.y + 4} textAnchor="end" fontSize={13} fontWeight={700} fill="#334155">
              {g.label}
            </text>
          </g>
        ))}

        {labels.map((lbl: string, i: number) => (
          <text key={i} x={xFor(i)} y={h - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill="#334155">
            {lbl}
          </text>
        ))}

        {series.map((s: Series, si: number) => {
          if (s.points.length === 0) return null;
          const path = s.points.map((p: Point, i: number) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ');
          const areaPath = path + ` L ${xFor(s.points.length - 1)} ${padT + plotH} L ${xFor(0)} ${padT + plotH} Z`;

          return (
            <g key={si}>
              <path d={areaPath} fill={`url(#line-grad-${si})`} />
              <path d={path} fill="none" stroke={s.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p: Point, i: number) => (

                <g key={i} className="group cursor-pointer">
                  <circle cx={xFor(i)} cy={yFor(p.value)} r={4.5} fill="white" stroke={s.color} strokeWidth={3} />
                  <circle cx={xFor(i)} cy={yFor(p.value)} r={8} fill={s.color} opacity={0.25} className="hidden group-hover:block" />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
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
          <text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize={11} fontWeight={700} fill="#334155">{g.label}</text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={i} x={xFor(i)} y={h - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155">
          {count > 12 && i % Math.ceil(count / 8) !== 0 ? '' : p.label}
        </text>
      ))}
      <path d={areaPath} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(p.value)} r={3.5} fill="white" stroke={color} strokeWidth={2.5} />
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
              <text x={padL - 8} y={y + rowH / 2 + 3} textAnchor="end" fontSize={11} fill="#334155" fontWeight={600}>
                {p.label.length > 14 ? p.label.slice(0, 13) + '…' : p.label}
              </text>
              <rect x={padL} y={y + 4} width={Math.max(2, barW)} height={rowH - 8} rx={4} fill={color} opacity={0.85} />
              <text x={padL + barW + 6} y={y + rowH / 2 + 3} fontSize={11} fill="#0f172a" fontWeight={700}>
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
          <text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize={11} fontWeight={700} fill="#334155">{g.label}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const barH = (p.value / maxVal) * plotH;
        const x = padL + i * (barW + gap) + gap / 2;
        const y = padT + plotH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(0, barH)} rx={3} fill={color} opacity={0.85} />
            <text x={x + barW / 2} y={h - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155">
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

export const DonutChart = ({ slices, size = 210, centerLabel, centerValue }: DonutChartProps) => {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  const radius = size / 2 - 8;
  const innerRadius = radius - 24; // 24px ring thickness -> 148px inner diameter hole!
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
    <div className="flex flex-col sm:flex-row items-center gap-5 justify-center py-1">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={24} />
        ) : (
          arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} />)
        )}
        {centerValue && (
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={16} fontWeight={800} fill="#0f172a">{centerValue}</text>
        )}
        {centerLabel && (
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill="#64748b" fontWeight={700}>{centerLabel}</text>
        )}
      </svg>
      <div className="space-y-2.5 w-full sm:w-auto">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center justify-between sm:justify-start gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-md shrink-0" style={{ background: s.color }} />
              <span className="text-slate-700 font-semibold">{s.label}</span>
            </div>
            <span className="text-slate-900 font-bold tabular-nums ml-auto pl-4">
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
