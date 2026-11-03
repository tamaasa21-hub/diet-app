"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, NutrientLine, PageHeader, useToast } from "@/components/ui";
import { FoodFormSheet, type FoodFormValue } from "@/components/FoodFormSheet";
import type { Food } from "@/lib/types";

const EXAMPLES: FoodFormValue[] = [
  { name: "プロテイン", unit: "1杯", kcal: 118, protein: 21, fat: 1.5, carbs: 5 },
  { name: "白米", unit: "150g", kcal: 234, protein: 3.8, fat: 0.5, carbs: 55.7 },
  { name: "鶏むね肉（皮なし）", unit: "100g", kcal: 105, protein: 23.3, fat: 1.9, carbs: 0.1 },
  { name: "ゆで卵", unit: "1個", kcal: 67, protein: 6.3, fat: 4.5, carbs: 0.2 },
  { name: "バナナ", unit: "1本", kcal: 93, protein: 1.1, fat: 0.2, carbs: 22.5 },
];

export default function FoodsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [foods, setFoods] = useState<Food[]>([]);
  const [editing, setEditing] = useState<Food | null>(null);
  const [creating, setCreating] = useState<FoodFormValue | null | undefined>(undefined);

  const load = useCallback(async () => {
    const { data } = await supabase.from("foods").select("*").order("name");
    setFoods((data as Food[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="マイ食品"
        back="/add"
        right={
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setCreating(null)}>
            ＋ 追加
          </button>
        }
      />
      <p className="mb-3 text-xs text-gray-500">よく食べるものを登録しておくと、記録画面からワンタップで追加できます。</p>

      {foods.length === 0 ? (
        <div className="space-y-3">
          <EmptyState>まだ登録がありません。下の例をタップすると、数値が入った状態で登録画面が開きます。</EmptyState>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex.name} onClick={() => setCreating(ex)} className="rounded-full bg-white px-3 py-1.5 text-sm shadow-sm">
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {foods.map((f) => (
            <li key={f.id}>
              <button onClick={() => setEditing(f)} className="card flex w-full flex-col text-left active:bg-gray-50">
                <span className="font-medium">
                  {f.name} <span className="text-xs text-gray-400">{f.unit}</span>
                </span>
                <NutrientLine n={f} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FoodFormSheet
        open={creating !== undefined}
        title="マイ食品を登録"
        initial={creating}
        onClose={() => setCreating(undefined)}
        onSubmit={async (v) => {
          const { error } = await supabase.from("foods").insert({ ...v, unit: v.unit || "1食" });
          if (error) return toast(`エラー：${error.message}`);
          toast("登録しました");
          setCreating(undefined);
          load();
        }}
      />
      <FoodFormSheet
        open={!!editing}
        title="マイ食品を編集"
        initial={editing}
        onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          await supabase.from("foods").update({ ...v, unit: v.unit || "1食" }).eq("id", editing!.id);
          setEditing(null);
          load();
        }}
        onDelete={async () => {
          await supabase.from("foods").delete().eq("id", editing!.id);
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
