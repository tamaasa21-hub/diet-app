"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { DateStepper, PageHeader, Segmented } from "@/components/ui";
import { MacroBar } from "@/components/Progress";
import { TargetBarChart } from "@/components/Charts";
import { addDays, addMonths, dateRange, endOfMonth, formatJP, formatShort, parseDate, startOfMonth, startOfWeek, todayStr } from "@/lib/date";
import { fmt, sumNutrients } from "@/lib/nutrition";
import { MEAL_TYPES, type MealEntry, type Nutrients } from "@/lib/types";

type Period = "day" | "week" | "month";

export default function StatsPage() {
  const { profile } = useProfile();
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(todayStr());
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [start, end] = useMemo(() => {
    if (period === "day") return [anchor, anchor];
    if (period === "week") {
      const s = startOfWeek(anchor);
      return [s, addDays(s, 6)];
    }
    return [startOfMonth(anchor), endOfMonth(anchor)];
  }, [period, anchor]);

  useEffect(() => {
    setLoading(true);
    createClient()
      .from("meal_entries")
      .select("*")
      .gte("eaten_on", start)
      .lte("eaten_on", end)
      .order("created_at")
      .then(({ data }) => {
        setEntries((data as MealEntry[]) ?? []);
        setLoading(false);
      });
  }, [start, end]);

  const today = todayStr();
  const move = (dir: 1 | -1) => {
    if (period === "day") setAnchor(addDays(anchor, dir));
    else if (period === "week") setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(addMonths(anchor, dir));
  };
  const label =
    period === "day"
      ? formatJP(anchor)
      : period === "week"
        ? `${formatJP(start, false)} 〜 ${formatJP(end, false)}`
        : `${parseDate(anchor).getFullYear()}年${parseDate(anchor).getMonth() + 1}月`;

  const targets: Nutrients = {
    kcal: profile.target_kcal ?? 0,
    protein: Number(profile.target_protein ?? 0),
    fat: Number(profile.target_fat ?? 0),
    carbs: Number(profile.target_carbs ?? 0),
  };

  return (
    <div>
      <PageHeader title="集計" />
      <div className="space-y-3">
        <Segmented
          options={[
            { value: "day", label: "日" },
            { value: "week", label: "週" },
            { value: "month", label: "月" },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <DateStepper label={label} onPrev={() => move(-1)} onNext={() => move(1)} nextDisabled={end >= today} />
      </div>
      <div className={`mt-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
        {period === "day" ? <DayView entries={entries} targets={targets} /> : <RangeView entries={entries} start={start} end={end} targets={targets} period={period} />}
      </div>
    </div>
  );
}

function DayView({ entries, targets }: { entries: MealEntry[]; targets: Nutrients }) {
  const total = sumNutrients(entries);
  return (
    <div className="space-y-3">
      <section className="card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-bold">合計</h2>
          <span className="text-2xl font-extrabold tabular-nums">
            {fmt(total.kcal, "kcal")}
            <span className="text-sm font-normal text-gray-500"> / {fmt(targets.kcal, "kcal")} kcal</span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MacroBar label="P" eaten={total.protein} target={targets.protein} color="var(--color-protein)" />
          <MacroBar label="F" eaten={total.fat} target={targets.fat} color="var(--color-fat)" mode="limit" />
          <MacroBar label="C" eaten={total.carbs} target={targets.carbs} color="var(--color-carbs)" mode="neutral" />
        </div>
      </section>
      <PfcBalance n={total} />
      <section className="card">
        <h2 className="mb-2 font-bold">食事ごと</h2>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-gray-400">
            <tr>
              <th className="text-left font-normal">区分</th>
              <th className="text-right font-normal">kcal</th>
              <th className="text-right font-normal">P</th>
              <th className="text-right font-normal">F</th>
              <th className="text-right font-normal">C</th>
            </tr>
          </thead>
          <tbody>
            {MEAL_TYPES.map((m) => {
              const s = sumNutrients(entries.filter((e) => e.meal_type === m.value));
              return (
                <tr key={m.value} className="border-t border-gray-50">
                  <td className="py-1.5">{m.label}</td>
                  <td className="text-right">{fmt(s.kcal, "kcal")}</td>
                  <td className="text-right">{fmt(s.protein)}</td>
                  <td className="text-right">{fmt(s.fat)}</td>
                  <td className="text-right">{fmt(s.carbs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** PFCバランス（カロリー比）の横棒 */
function PfcBalance({ n }: { n: Nutrients }) {
  const p = n.protein * 4;
  const f = n.fat * 9;
  const c = n.carbs * 4;
  const sum = p + f + c;
  if (sum === 0) return null;
  const parts = [
    { key: "P", label: "タンパク質", v: p, color: "var(--color-protein)" },
    { key: "F", label: "脂質", v: f, color: "var(--color-fat)" },
    { key: "C", label: "炭水化物", v: c, color: "var(--color-carbs)" },
  ];
  return (
    <section className="card">
      <h2 className="mb-2 font-bold">PFCバランス（カロリー比）</h2>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-full">
        {parts.map((x) => (
          <div key={x.key} style={{ width: `${(x.v / sum) * 100}%`, background: x.color }} title={`${x.label} ${Math.round((x.v / sum) * 100)}%`} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-600">
        {parts.map((x) => (
          <span key={x.key} className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />
            {x.label} <b className="tabular-nums">{Math.round((x.v / sum) * 100)}%</b>
          </span>
        ))}
      </div>
    </section>
  );
}

function RangeView({
  entries,
  start,
  end,
  targets,
  period,
}: {
  entries: MealEntry[];
  start: string;
  end: string;
  targets: Nutrients;
  period: "week" | "month";
}) {
  const today = todayStr();
  const days = dateRange(start, end);
  const daily = days.map((d) => {
    const items = entries.filter((e) => e.eaten_on === d);
    return { date: d, count: items.length, ...sumNutrients(items) };
  });
  const recorded = daily.filter((d) => d.count > 0);
  const avg = recorded.length > 0 ? sumNutrients(recorded) : null;
  const avgOf = (k: keyof Nutrients) => (avg ? avg[k] / recorded.length : 0);
  const inRange = recorded.filter((d) => d.kcal <= targets.kcal * 1.05 && d.kcal >= targets.kcal * 0.85).length;
  const proteinOk = recorded.filter((d) => d.protein >= targets.protein * 0.95).length;
  const fatOk = recorded.filter((d) => d.fat <= targets.fat).length;

  const labelOf = (d: string) => (period === "week" ? ["月", "火", "水", "木", "金", "土", "日"][(parseDate(d).getDay() + 6) % 7] : String(parseDate(d).getDate()));
  const series = (k: keyof Nutrients) =>
    daily.map((d) => ({ label: labelOf(d.date), full: formatJP(d.date), value: d.count > 0 ? d[k] : d.date > today ? null : 0 }));

  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="mb-2 font-bold">
          1日平均 <span className="text-xs font-normal text-gray-400">（記録した{recorded.length}日間）</span>
        </h2>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Avg label="kcal" value={fmt(avgOf("kcal"), "kcal")} target={fmt(targets.kcal, "kcal")} />
          <Avg label="P (g)" value={fmt(avgOf("protein"))} target={fmt(targets.protein)} />
          <Avg label="F (g)" value={fmt(avgOf("fat"))} target={fmt(targets.fat)} />
          <Avg label="C (g)" value={fmt(avgOf("carbs"))} target={fmt(targets.carbs)} />
        </div>
        {recorded.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-gray-600">
            <li>
              🎯 カロリーが目標どおり（-15%〜+5%）: <b>{inRange}</b> / {recorded.length}日
            </li>
            <li>
              💪 タンパク質を達成: <b>{proteinOk}</b> / {recorded.length}日
            </li>
            <li>
              🥑 脂質を上限内に: <b>{fatOk}</b> / {recorded.length}日
            </li>
          </ul>
        )}
      </section>

      <ChartCard title="カロリー (kcal)">
        <TargetBarChart data={series("kcal")} target={targets.kcal} color="#10b981" unit="kcal" />
      </ChartCard>
      <ChartCard title="タンパク質 (g)">
        <TargetBarChart data={series("protein")} target={targets.protein} color="#3b82f6" unit="g" height={150} />
      </ChartCard>
      <ChartCard title="脂質 (g)" note="上限を超えた日は赤">
        <TargetBarChart data={series("fat")} target={targets.fat} color="#f59e0b" overColor="#dc2626" unit="g" height={150} />
      </ChartCard>

      <details className="card">
        <summary className="cursor-pointer font-bold">日ごとの数値（表）</summary>
        <table className="mt-2 w-full text-sm tabular-nums">
          <thead className="text-xs text-gray-400">
            <tr>
              <th className="text-left font-normal">日付</th>
              <th className="text-right font-normal">kcal</th>
              <th className="text-right font-normal">P</th>
              <th className="text-right font-normal">F</th>
              <th className="text-right font-normal">C</th>
            </tr>
          </thead>
          <tbody>
            {daily
              .filter((d) => d.date <= today)
              .map((d) => (
                <tr key={d.date} className="border-t border-gray-50">
                  <td className="py-1.5">{formatShort(d.date)}</td>
                  {d.count === 0 ? (
                    <td colSpan={4} className="text-right text-gray-300">
                      記録なし
                    </td>
                  ) : (
                    <>
                      <td className="text-right">{fmt(d.kcal, "kcal")}</td>
                      <td className="text-right">{fmt(d.protein)}</td>
                      <td className={`text-right ${d.fat > targets.fat ? "font-bold text-red-600" : ""}`}>{fmt(d.fat)}</td>
                      <td className="text-right">{fmt(d.carbs)}</td>
                    </>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Avg({ label, value, target }: { label: string; value: string; target: string }) {
  return (
    <div className="rounded-xl bg-gray-50 py-2">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-gray-400">
        {label}・目標{target}
      </div>
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card px-2 pb-2">
      <h2 className="mb-1 px-2 font-bold">
        {title} {note && <span className="text-xs font-normal text-gray-400">{note}</span>}
      </h2>
      {children}
    </section>
  );
}
