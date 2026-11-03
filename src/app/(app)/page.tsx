"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { KcalRing, MacroBar } from "@/components/Progress";
import { EntryEditSheet } from "@/components/EntryEditSheet";
import { DateStepper, NutrientLine } from "@/components/ui";
import { addDays, formatJP, todayStr } from "@/lib/date";
import { fmt, sumNutrients } from "@/lib/nutrition";
import { MEAL_TYPES, type MealEntry } from "@/lib/types";

export default function HomePage() {
  const { profile } = useProfile();
  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MealEntry | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("meal_entries")
      .select("*")
      .eq("eaten_on", date)
      .order("created_at");
    setEntries((data as MealEntry[]) ?? []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const total = sumNutrients(entries);
  const isToday = date === todayStr();
  const greeting = profile.display_name ? `${profile.display_name}さん` : "";

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">{greeting && `${greeting}、`}おつかれさま！</p>
          <h1 className="text-xl font-bold">{isToday ? "今日" : formatJP(date)}の食事</h1>
        </div>
        {!isToday && (
          <button onClick={() => setDate(todayStr())} className="btn-secondary px-3 py-1.5 text-sm">
            今日へ
          </button>
        )}
      </div>

      <DateStepper
        label={formatJP(date)}
        onPrev={() => setDate(addDays(date, -1))}
        onNext={() => setDate(addDays(date, 1))}
        nextDisabled={isToday}
      />

      <GoalBanner />

      <section className={`card mt-3 transition-opacity ${loading ? "opacity-50" : ""}`}>
        <KcalRing eaten={total.kcal} target={profile.target_kcal ?? 0} />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <MacroBar label="タンパク質" eaten={total.protein} target={Number(profile.target_protein ?? 0)} color="var(--color-protein)" />
          <MacroBar label="脂質" eaten={total.fat} target={Number(profile.target_fat ?? 0)} color="var(--color-fat)" mode="limit" />
          <MacroBar label="炭水化物" eaten={total.carbs} target={Number(profile.target_carbs ?? 0)} color="var(--color-carbs)" mode="neutral" />
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={`/add?date=${date}&ai=voice`} className="btn-primary py-3">
          🎤 話して記録
        </Link>
        <Link href={`/add?date=${date}&ai=label`} className="btn-secondary py-3">
          📷 成分表示を撮る
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {MEAL_TYPES.map((m) => {
          const items = entries.filter((e) => e.meal_type === m.value);
          const sub = sumNutrients(items);
          return (
            <section key={m.value} className="card p-0">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <h2 className="font-bold">
                  {m.icon} {m.label}
                  {items.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">{fmt(sub.kcal, "kcal")}kcal</span>}
                </h2>
                <Link
                  href={`/add?date=${date}&meal=${m.value}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xl text-brand-600"
                  aria-label={`${m.label}を追加`}
                >
                  +
                </Link>
              </div>
              {items.length > 0 && (
                <ul className="divide-y divide-gray-50 border-t border-gray-50">
                  {items.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => setEditing(e)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left active:bg-gray-50">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{e.name}</div>
                          {e.amount && <div className="text-xs text-gray-400">{e.amount}</div>}
                        </div>
                        <NutrientLine n={e} className="shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <EntryEditSheet entry={editing} onClose={() => setEditing(null)} onChanged={load} />
    </div>
  );
}

/** ホーム上部の「🎯 ゴールまで あと○kg」 */
function GoalBanner() {
  const { profile } = useProfile();
  const [latest, setLatest] = useState<number | null>(null);
  const hasGoal = profile.goal_weight_kg != null;
  useEffect(() => {
    if (!hasGoal) return;
    createClient()
      .from("weight_logs")
      .select("weight_kg")
      .order("logged_on", { ascending: false })
      .limit(1)
      .then(({ data }) => setLatest(data?.[0] ? Number(data[0].weight_kg) : null));
  }, [hasGoal]);
  const current = latest ?? (profile.weight_kg != null ? Number(profile.weight_kg) : null);
  if (!hasGoal || current == null) return null;
  const target = Number(profile.goal_weight_kg);
  const start = Number(profile.goal_start_weight ?? current);
  const total = target - start;
  const progress = total === 0 ? 1 : Math.min(1, Math.max(0, (current - start) / total));
  const reached = target < start ? current <= target : target > start ? current >= target : true;
  return (
    <Link href="/weight" className="mt-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-sm active:bg-gray-50">
      <span className="text-xl">🎯</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">
          {reached ? "目標体重を達成！🎉" : `ゴールまで あと${Math.abs(target - current).toFixed(1)}kg`}
          <span className="ml-1 text-xs font-normal text-gray-400">（{Math.round(progress * 100)}%）</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <span className="text-gray-300">›</span>
    </Link>
  );
}
