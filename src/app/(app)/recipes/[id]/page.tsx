"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, NutrientLine, PageHeader, Sheet, useToast } from "@/components/ui";
import { FoodFormSheet } from "@/components/FoodFormSheet";
import { PortionPicker } from "@/components/PortionPicker";
import { fmt, scaleNutrients, sumNutrients } from "@/lib/nutrition";
import { guessMealType, todayStr } from "@/lib/date";
import { MEAL_TYPES, type Food, type MealType, type Recipe, type RecipeIngredient } from "@/lib/types";

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ings, setIngs] = useState<RecipeIngredient[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingIng, setEditingIng] = useState<RecipeIngredient | null>(null);
  const [pickFoodOpen, setPickFoodOpen] = useState(false);
  const [foodForQty, setFoodForQty] = useState<Food | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [mealType, setMealType] = useState<MealType>(guessMealType());

  const load = useCallback(async () => {
    const [r, i] = await Promise.all([
      supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
      supabase.from("recipe_ingredients").select("*").eq("recipe_id", id).order("created_at"),
    ]);
    if (!r.data) return router.replace("/recipes");
    setRecipe(r.data as Recipe);
    setIngs((i.data as RecipeIngredient[]) ?? []);
  }, [supabase, id, router]);

  useEffect(() => {
    load();
    supabase
      .from("foods")
      .select("*")
      .order("name")
      .then(({ data }) => setFoods((data as Food[]) ?? []));
  }, [load, supabase]);

  const total = sumNutrients(ings);

  async function rename() {
    const name = prompt("料理名", recipe?.name);
    if (!name) return;
    await supabase.from("recipes").update({ name }).eq("id", id);
    load();
  }

  async function removeRecipe() {
    if (!confirm("この料理を削除しますか？（記録済みの食事は消えません）")) return;
    await supabase.from("recipes").delete().eq("id", id);
    router.replace("/recipes");
  }

  if (!recipe) return null;

  return (
    <div>
      <PageHeader
        title={recipe.name}
        back="/recipes"
        right={
          <button onClick={rename} className="text-sm text-gray-500">
            名前変更
          </button>
        }
      />

      <section className="card text-center">
        <p className="text-xs text-gray-500">料理全体の合計</p>
        <p className="text-3xl font-extrabold">
          {fmt(total.kcal, "kcal")}
          <span className="text-base font-normal"> kcal</span>
        </p>
        <p className="mt-1 text-sm">
          <span className="text-protein-ink">P {fmt(total.protein)}g</span>
          <span className="ml-3 text-fat-ink">F {fmt(total.fat)}g</span>
          <span className="ml-3 text-carbs-ink">C {fmt(total.carbs)}g</span>
        </p>
        <div className="mt-3 grid grid-cols-4 gap-1 text-[11px] text-gray-500">
          {[2, 3, 4, 6].map((d) => (
            <div key={d} className="rounded-lg bg-gray-50 py-1">
              1/{d}: <b>{fmt(total.kcal / d, "kcal")}</b>kcal
            </div>
          ))}
        </div>
        <button onClick={() => setRecordOpen(true)} disabled={ings.length === 0} className="btn-primary mt-3 w-full">
          この料理を食べた → 記録する
        </button>
      </section>

      <h2 className="mt-5 mb-2 font-bold">材料</h2>
      {ings.length === 0 ? (
        <EmptyState>下のボタンから材料を追加してください</EmptyState>
      ) : (
        <ul className="card divide-y divide-gray-50 p-0">
          {ings.map((i) => (
            <li key={i.id}>
              <button onClick={() => setEditingIng(i)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left active:bg-gray-50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{i.name}</div>
                  {i.amount && <div className="text-xs text-gray-400">{i.amount}</div>}
                </div>
                <NutrientLine n={i} className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={() => setPickFoodOpen(true)}>
          マイ食品から
        </button>
        <button className="btn-secondary" onClick={() => setManualOpen(true)}>
          手入力で追加
        </button>
      </div>

      <button onClick={removeRecipe} className="mt-10 w-full text-sm text-red-500">
        この料理を削除
      </button>

      {/* 材料: 手入力 */}
      <FoodFormSheet
        open={manualOpen}
        title="材料を追加"
        unitLabel="量"
        unitPlaceholder="例：200g、1/2個"
        onClose={() => setManualOpen(false)}
        onSubmit={async (v) => {
          await supabase.from("recipe_ingredients").insert({ recipe_id: id, name: v.name, amount: v.unit || null, kcal: v.kcal, protein: v.protein, fat: v.fat, carbs: v.carbs });
          setManualOpen(false);
          load();
        }}
      />
      {/* 材料: 編集 */}
      <FoodFormSheet
        open={!!editingIng}
        title="材料を編集"
        unitLabel="量"
        initial={editingIng ? { ...editingIng, unit: editingIng.amount ?? "" } : null}
        onClose={() => setEditingIng(null)}
        onSubmit={async (v) => {
          await supabase
            .from("recipe_ingredients")
            .update({ name: v.name, amount: v.unit || null, kcal: v.kcal, protein: v.protein, fat: v.fat, carbs: v.carbs })
            .eq("id", editingIng!.id);
          setEditingIng(null);
          load();
        }}
        onDelete={async () => {
          await supabase.from("recipe_ingredients").delete().eq("id", editingIng!.id);
          setEditingIng(null);
          load();
        }}
      />
      {/* 材料: マイ食品から選ぶ */}
      <Sheet open={pickFoodOpen} onClose={() => setPickFoodOpen(false)} title="マイ食品から選ぶ">
        {foods.length === 0 ? (
          <EmptyState>マイ食品がまだありません</EmptyState>
        ) : (
          <ul className="space-y-2">
            {foods.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => {
                    setPickFoodOpen(false);
                    setFoodForQty(f);
                  }}
                  className="flex w-full flex-col rounded-xl border border-gray-100 px-3 py-2 text-left active:bg-gray-50"
                >
                  <span className="text-sm font-medium">
                    {f.name} <span className="text-xs text-gray-400">{f.unit}</span>
                  </span>
                  <NutrientLine n={f} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <Sheet open={!!foodForQty} onClose={() => setFoodForQty(null)} title={foodForQty ? `${foodForQty.name}をいくつ使う？` : ""}>
        {foodForQty && (
          <PortionPicker
            base={foodForQty}
            kind="multiple"
            unit={foodForQty.unit}
            onConfirm={async (p) => {
              const n = scaleNutrients(foodForQty, p.ratio);
              await supabase.from("recipe_ingredients").insert({ recipe_id: id, name: foodForQty.name, amount: `${foodForQty.unit} ${p.label}`, ...n });
              setFoodForQty(null);
              load();
            }}
          />
        )}
      </Sheet>
      {/* 食べた分を記録 */}
      <Sheet open={recordOpen} onClose={() => setRecordOpen(false)} title="どれくらい食べた？">
        <div className="mb-3 grid grid-cols-4 gap-1">
          {MEAL_TYPES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMealType(m.value)}
              className={`rounded-lg py-2 text-sm font-semibold ${mealType === m.value ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <PortionPicker
          base={total}
          kind="fraction"
          onConfirm={async (p) => {
            const { error } = await supabase.from("meal_entries").insert({
              eaten_on: todayStr(),
              meal_type: mealType,
              name: recipe.name,
              amount: p.label === "全部" ? "全部" : `${p.label}を食べた`,
              ...scaleNutrients(total, p.ratio),
            });
            if (error) return toast(`エラー：${error.message}`);
            setRecordOpen(false);
            toast("今日の記録に追加しました");
          }}
        />
      </Sheet>
    </div>
  );
}
