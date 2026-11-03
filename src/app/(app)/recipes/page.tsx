"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, NutrientLine, PageHeader, Sheet } from "@/components/ui";
import { sumNutrients } from "@/lib/nutrition";
import type { Nutrients, Recipe, RecipeIngredient } from "@/lib/types";

export default function RecipesPage() {
  const supabase = createClient();
  const router = useRouter();
  const [recipes, setRecipes] = useState<(Recipe & { total: Nutrients; count: number })[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const [r, ing] = await Promise.all([
      supabase.from("recipes").select("*").order("created_at", { ascending: false }),
      supabase.from("recipe_ingredients").select("recipe_id,kcal,protein,fat,carbs"),
    ]);
    const ings = (ing.data as RecipeIngredient[]) ?? [];
    setRecipes(
      ((r.data as Recipe[]) ?? []).map((rc) => {
        const mine = ings.filter((i) => i.recipe_id === rc.id);
        return { ...rc, total: sumNutrients(mine), count: mine.length };
      }),
    );
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from("recipes").insert({ name }).select("id").single();
    if (!error && data) router.push(`/recipes/${data.id}`);
  }

  return (
    <div>
      <PageHeader
        title="自作料理"
        back="/add"
        right={
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setCreating(true)}>
            ＋ 新しい料理
          </button>
        }
      />
      <p className="mb-3 text-xs text-gray-500">
        材料を入れると合計を自動で計算します。記録するときは「1/4 食べた」のように割合を選べます。
      </p>
      {recipes.length === 0 ? (
        <EmptyState>例：カレー（鍋1つ分）、作り置きのチキンハム など</EmptyState>
      ) : (
        <ul className="space-y-2">
          {recipes.map((r) => (
            <li key={r.id}>
              <Link href={`/recipes/${r.id}`} className="card flex flex-col active:bg-gray-50">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-gray-400">材料 {r.count}品 ・ 全体の合計</span>
                <NutrientLine n={r.total} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="新しい料理">
        <form onSubmit={create} className="space-y-3">
          <input className="input" placeholder="料理名（例：チキンカレー 鍋1つ分）" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <button className="btn-primary w-full">作成して材料を入れる</button>
        </form>
      </Sheet>
    </div>
  );
}
