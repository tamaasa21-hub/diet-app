"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MEAL_TYPES, type MealEntry, type MealType } from "@/lib/types";
import { NutrientInputs, Segmented, Sheet, parseNutrientStrings, toNutrientStrings, type NutrientStrings } from "./ui";

/** 記録済みの食事を編集・削除するシート */
export function EntryEditSheet({ entry, onClose, onChanged }: { entry: MealEntry | null; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [date, setDate] = useState("");
  const [nut, setNut] = useState<NutrientStrings>({ kcal: "", protein: "", fat: "", carbs: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setAmount(entry.amount ?? "");
    setMealType(entry.meal_type);
    setDate(entry.eaten_on);
    setNut(toNutrientStrings(entry));
  }, [entry]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!entry) return;
    setBusy(true);
    await createClient()
      .from("meal_entries")
      .update({ name, amount: amount || null, meal_type: mealType, eaten_on: date, ...parseNutrientStrings(nut) })
      .eq("id", entry.id);
    setBusy(false);
    onChanged();
    onClose();
  }

  async function remove() {
    if (!entry || !confirm(`「${entry.name}」を削除しますか？`)) return;
    setBusy(true);
    await createClient().from("meal_entries").delete().eq("id", entry.id);
    setBusy(false);
    onChanged();
    onClose();
  }

  return (
    <Sheet open={!!entry} onClose={onClose} title="記録を編集">
      <form onSubmit={save} className="space-y-3">
        <Segmented options={MEAL_TYPES.map((m) => ({ value: m.value, label: m.label }))} value={mealType} onChange={setMealType} />
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        <input className="input" placeholder="食品名" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="input" placeholder="量（例：1杯、200g）" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <NutrientInputs value={nut} onChange={setNut} />
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={remove} disabled={busy} className="btn-danger">
            削除
          </button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            保存
          </button>
        </div>
      </form>
    </Sheet>
  );
}
