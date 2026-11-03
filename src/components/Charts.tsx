"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef0ef";

type BarDatum = { label: string; value: number | null; full?: string };

/** 1系列の棒グラフ + 目標ライン */
export function TargetBarChart({
  data,
  target,
  color,
  unit,
  overColor,
  height = 180,
}: {
  data: BarDatum[];
  target?: number;
  color: string;
  unit: string;
  /** 目標を超えた棒の色（上限系の指標用） */
  overColor?: string;
  height?: number;
}) {
  const max = Math.max(target ?? 0, ...data.map((d) => d.value ?? 0));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#d1d5db" }} interval="preserveStartEnd" minTickGap={4} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, Math.ceil((max * 1.1) / 10) * 10 || 10]} />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          formatter={(v) => [`${Math.round(Number(v) * 10) / 10} ${unit}`, ""]}
          labelFormatter={(_, p) => (p?.[0]?.payload as BarDatum | undefined)?.full ?? ""}
          separator=""
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={overColor && target && (d.value ?? 0) > target ? overColor : color} />
          ))}
        </Bar>
        {target ? (
          <ReferenceLine
            y={target}
            stroke="#374151"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: `目標 ${target}`, position: "insideTopRight", fontSize: 10, fill: "#374151" }}
          />
        ) : null}
      </BarChart>
    </ResponsiveContainer>
  );
}

type LineDatum = { label: string; value: number | null; full?: string };

/** 体重推移の折れ線グラフ */
export function WeightLineChart({ data, height = 220 }: { data: LineDatum[]; height?: number }) {
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  const min = Math.floor(Math.min(...vals) - 1);
  const max = Math.ceil(Math.max(...vals) + 1);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#d1d5db" }} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[min, max]} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: "#9ca3af", strokeDasharray: "3 3" }}
          formatter={(v) => [`${v} kg`, ""]}
          labelFormatter={(_, p) => (p?.[0]?.payload as LineDatum | undefined)?.full ?? ""}
          separator=""
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#059669"
          strokeWidth={2}
          dot={{ r: 3, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ---------------- 目標体重までの道のりグラフ ---------------- */
type GoalPoint = { t: number; actual?: number; plan?: number; projection?: number };

export function GoalChart({
  logs,
  start,
  startDate,
  target,
  endDate,
  projection,
  height = 240,
}: {
  logs: { date: string; weight: number }[];
  start: number;
  startDate: string;
  target: number;
  /** 予定ラインの終点（目標日 or 提案日） */
  endDate: string;
  /** 予測ライン（最新の記録 → 到達予定日） */
  projection: { from: { date: string; weight: number }; to: { date: string; weight: number } } | null;
  height?: number;
}) {
  const ts = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).getTime();
  };
  const map = new Map<number, GoalPoint>();
  const put = (d: string, k: keyof Omit<GoalPoint, "t">, v: number) => {
    const t = ts(d);
    const p = map.get(t) ?? { t };
    p[k] = Math.round(v * 10) / 10;
    map.set(t, p);
  };
  logs.forEach((l) => put(l.date, "actual", l.weight));
  put(startDate, "plan", start);
  put(endDate, "plan", target);
  if (projection) {
    put(projection.from.date, "projection", projection.from.weight);
    put(projection.to.date, "projection", projection.to.weight);
  }
  const data = [...map.values()].sort((a, b) => a.t - b.t);
  const vals = data.flatMap((p) => [p.actual, p.plan, p.projection]).filter((v): v is number => v != null);
  const min = Math.floor(Math.min(...vals, target) - 0.5);
  const max = Math.ceil(Math.max(...vals, target) + 0.5);
  const fmtDate = (t: number) => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-center gap-x-3 gap-y-1 px-2 text-[11px] text-gray-600">
        <LegendItem color="#059669" label="実際の体重" />
        <LegendItem color="#9ca3af" label="予定" dashed />
        <LegendItem color="#d97706" label="今のペースの予測" dotted />
        <LegendItem color="#374151" label={`目標 ${target}kg`} />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtDate} tick={AXIS} tickLine={false} axisLine={{ stroke: "#d1d5db" }} minTickGap={24} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[min, max]} allowDecimals={false} />
          <Tooltip
            labelFormatter={(t) => fmtDate(Number(t))}
            formatter={(v, name) => [`${v} kg`, name === "actual" ? "実際" : name === "plan" ? "予定" : "予測"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
          />
          <ReferenceLine y={target} stroke="#374151" strokeWidth={1.5} />
          <Line dataKey="plan" stroke="#9ca3af" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="projection" stroke="#d97706" strokeWidth={2} strokeDasharray="2 4" dot={false} connectNulls isAnimationActive={false} />
          <Line
            dataKey="actual"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 3, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LegendItem({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <svg width="18" height="6" aria-hidden>
        <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "5 3" : dotted ? "2 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
