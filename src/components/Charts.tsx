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
