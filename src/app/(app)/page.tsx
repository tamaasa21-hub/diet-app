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
