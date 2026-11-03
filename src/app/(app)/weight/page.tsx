"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { EmptyState, PageHeader, Segmented, useToast } from "@/components/ui";
import { WeightLineChart } from "@/components/Charts";
import { addDays, formatJP, formatShort, todayStr } from "@/lib/date";
import type { WeightLog } from "@/lib/types";

type Range = "30" | "90" | "365";

export default function WeightPage() {
  const supabase = createClient();
  const toast = useToast();
  const { profile, userId, reload } = useProfile();
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState("");
  const [range, setRange] = useState<Range>("30");

  const load = useCallback(async () => {
    const { data } = await supabase.from("weight_logs").select("*").order("logged_on", { ascending: false }).limit(400);
    setLogs((data as WeightLog[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(weight);
    if (!w) return;
    const { error } = await supabase
      .from("weight_logs")
      .upsert({ user_id: userId, logged_on: date, weight_kg: w }, { onConflict: "user_id,logged_on" });
    if (error) return toast(`エラー：${error.message}`);
    // 最新の体重ならプロフィールも更新
    const latest = logs[0];
    if (!latest || date >= latest.logged_on) {
      await supabase.from("profiles").update({ weight_kg: w }).eq("id", userId);
      reload();
    }
    toast(`${formatJP(date)} ${w}kg を記録しました`);
    setWeight("");
    load();
  }

  async function remove(log: WeightLog) {
    if (!confirm(`${formatJP(log.logged_on)} の記録を削除しますか？`)) return;
    await supabase.from("weight_logs").delete().eq("id", log.id);
    load();
  }

  const chartData = useMemo(() => {
    const from = addDays(todayStr(), -Number(range));
    return logs
      .filter((l) => l.logged_on >= from)
      .slice()
      .reverse()
      .map((l) => ({ label: formatShort(l.logged_on), full: formatJP(l.logged_on), value: Number(l.weight_kg) }));
  }, [logs, range]);

  const latest = logs[0];
  const first = chartData[0];
  const diff = latest && first ? Number(latest.weight_kg) - first.value : 0;

  return (
    <div>
      <PageHeader title="体重" />

      <form onSubmit={save} className="card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} required />
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="20"
              max="300"
              className="input pr-10"
              placeholder={latest ? String(latest.weight_kg) : String(profile.weight_kg ?? "")}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">kg</span>
          </div>
        </div>
        <button className="btn-primary w-full">記録する</button>
      </form>

      {latest && (
        <section className="card mt-3 flex items-center justify-around text-center">
          <div>
            <div className="text-xs text-gray-500">最新（{formatShort(latest.logged_on)}）</div>
            <div className="text-3xl font-extrabold tabular-nums">
              {Number(latest.weight_kg).toFixed(1)}
              <span className="text-base font-normal"> kg</span>
            </div>
          </div>
          {chartData.length > 1 && (
            <div>
              <div className="text-xs text-gray-500">期間内の変化</div>
              <div className={`text-2xl font-bold tabular-nums ${diff < 0 ? "text-brand-700" : diff > 0 ? "text-amber-700" : ""}`}>
                {diff > 0 ? "+" : diff < 0 ? "−" : "±"}
                {Math.abs(diff).toFixed(1)} kg
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card mt-3 px-2">
        <div className="mb-2 px-2">
          <Segmented
            options={[
              { value: "30", label: "1か月" },
              { value: "90", label: "3か月" },
              { value: "365", label: "1年" },
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
        {chartData.length > 0 ? <WeightLineChart data={chartData} /> : <EmptyState>この期間の記録はまだありません</EmptyState>}
      </section>

      {logs.length > 0 && (
        <section className="card mt-3 p-0">
          <h2 className="px-4 pt-3 pb-1 font-bold">記録一覧</h2>
          <ul className="divide-y divide-gray-50">
            {logs.slice(0, 60).map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{formatJP(l.logged_on)}</span>
                <span className="flex items-center gap-3">
                  <b className="tabular-nums">{Number(l.weight_kg).toFixed(1)} kg</b>
                  <button onClick={() => remove(l)} className="text-gray-300" aria-label="削除">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
