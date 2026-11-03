"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Segmented, Sheet, NutrientLine, NutrientInputs, EmptyState, useToast, parseNutrientStrings, emptyNutrientStrings, type NutrientStrings } from "@/components/ui";
import { PortionPicker, type Portion } from "@/components/PortionPicker";
import { AiInput } from "@/components/AiInput";
import { useProfile } from "@/components/ProfileProvider";
import { guessMealType, todayStr, formatJP } from "@/lib/date";
import { scaleNutrients, sumNutrients } from "@/lib/nutrition";
import { MEAL_TYPES, type Food, type MealType, type Nutrients, type Recipe, type RecipeIngredient } from "@/lib/types";

type Tab = "foods" | "recipes" | "manual";
type RecipeWithTotal = Recipe & { total: Nutrients; count: number };
type RecentItem = Nutrients & { name: string; amount: string | null };

export default function AddPage() {
  return (
    <Suspense>
      <AddPageInner />
    </Suspense>
  );
}

function AddPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const supabase = createClient();
  const { profile } = useProfile();
  const aiParam = params.get("ai");

  const [date, setDate] = useState(params.get("date") ?? todayStr());
  const [mealType, setMealType] = useState<MealType>((params.get("meal") as MealType) ?? guessMealType());
  const [tab, setTab] = useState<Tab>("foods");
  const [query, setQuery] = useState("");

  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithTotal[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [dayTotal, setDayTotal] = useState<Nutrients>({ kcal: 0, protein: 0, fat: 0, carbs: 0 });

  const [portionFood, setPortionFood] = useState<Food | null>(null);
  const [portionRecipe, setPortionRecipe] = useState<RecipeWithTotal | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCount = useCallback(async () => {
    const { data } = await supabase.from("meal_entries").select("meal_type,kcal,protein,fat,carbs").eq("eaten_on", date);
    const rows = (data as (Nutrients & { meal_type: MealType })[]) ?? [];
    setTodayCount(rows.filter((r) => r.meal_type === mealType).length);
    setDayTotal(sumNutrients(rows));
  }, [supabase, date, mealType]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  useEffect(() => {
    (async () => {
      const [f, r, ing, rec] = await Promise.all([
        supabase.from("foods").select("*").order("name"),
        supabase.from("recipes").select("*").order("created_at", { ascending: false }),
        supabase.from("recipe_ingredients").select("recipe_id,kcal,protein,fat,carbs"),
        supabase.from("meal_entries").select("name,amount,kcal,protein,fat,carbs").order("created_at", { ascending: false }).limit(60),
      ]);
      setFoods((f.data as Food[]) ?? []);
      const ings = (ing.data as RecipeIngredient[]) ?? [];
      setRecipes(
        ((r.data as Recipe[]) ?? []).map((rc) => {
          const mine = ings.filter((i) => i.recipe_id === rc.id);
          return { ...rc, total: sumNutrients(mine), count: mine.length };
        }),
      );
      const seen = new Set<string>();
      const list: RecentItem[] = [];
      for (const e of (rec.data as RecentItem[]) ?? []) {
        const key = `${e.name}|${e.amount}|${e.kcal}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(e);
        if (list.length >= 10) break;
      }
      setRecent(list);
    })();
  }, [supabase]);

  async function insertEntry(name: string, amount: string | null, n: Nutrients) {
    setBusy(true);
    const { data, error } = await supabase
      .from("meal_entries")
      .insert({ eaten_on: date, meal_type: mealType, name, amount, kcal: n.kcal, protein: n.protein, fat: n.fat, carbs: n.carbs })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast(`エラー：${error.message}`);
      return false;
    }
    loadCount();
    toast(`「${name}」を追加しました`, {
      label: "取り消し",
      onClick: async () => {
        await supabase.from("meal_entries").delete().eq("id", data.id);
        loadCount();
        toast("取り消しました");
      },
    });
    return true;
  }

  const q = query.trim().toLowerCase();
  const filteredFoods = useMemo(() => foods.filter((f) => f.name.toLowerCase().includes(q)), [foods, q]);
  const filteredRecipes = useMemo(() => recipes.filter((r) => r.name.toLowerCase().includes(q)), [recipes, q]);
  const filteredRecent = useMemo(() => recent.filter((r) => r.name.toLowerCase().includes(q)), [recent, q]);

  const mealLabel = MEAL_TYPES.find((m) => m.value === mealType)?.label;

  return (
    <div>
      <PageHeader
        title="食事を記録"
        right={
          <button onClick={() => router.push("/")} className="btn-primary px-3 py-1.5 text-sm">
            完了{todayCount > 0 && `（${todayCount}）`}
          </button>
        }
      />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input type="date" className="input w-auto flex-1" value={date} onChange={(e) => setDate(e.target.value)} />
          <span className="text-sm text-gray-500">{formatJP(date)}</span>
        </div>
        <Segmented options={MEAL_TYPES.map((m) => ({ value: m.value, label: `${m.icon}${m.label}` }))} value={mealType} onChange={setMealType} />
        <AiInput
          date={date}
          mealType={mealType}
          dayTotal={dayTotal}
          targetKcal={profile.target_kcal ?? 0}
          onRecorded={loadCount}
          initialOpen={aiParam === "voice" || aiParam === "label" ? aiParam : null}
        />
        <p className="text-center text-xs text-gray-500">
          今日の合計 {Math.round(dayTotal.kcal).toLocaleString()} kcal ・ あと{" "}
          <b>{Math.round((profile.target_kcal ?? 0) - dayTotal.kcal).toLocaleString()} kcal</b>
        </p>
        <Segmented
          options={[
            { value: "foods", label: "マイ食品" },
            { value: "recipes", label: "自作料理" },
            { value: "manual", label: "手入力" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab !== "manual" && (
          <input className="input" placeholder="🔍 検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
      </div>

      <div className="mt-4">
        {tab === "foods" && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              タップで <b>{mealLabel}</b> に1つ追加。「量」で数量を変えられます。
            </p>
            {filteredFoods.length === 0 ? (
              <EmptyState>
                マイ食品がまだありません。
                <br />
                <Link href="/foods" className="font-semibold text-brand-600">
                  よく食べる食品を登録する →
                </Link>
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {filteredFoods.map((f) => (
                  <li key={f.id} className="card flex items-center gap-2 p-0">
                    <button
                      disabled={busy}
                      onClick={() => insertEntry(f.name, f.unit, f)}
                      className="flex min-w-0 flex-1 flex-col px-4 py-3 text-left active:bg-gray-50"
                    >
                      <span className="truncate font-medium">
                        {f.name} <span className="text-xs text-gray-400">{f.unit}</span>
                      </span>
                      <NutrientLine n={f} />
                    </button>
                    <button onClick={() => setPortionFood(f)} className="mr-3 shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">
                      量
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/foods" className="block text-center text-sm font-semibold text-brand-600">
              マイ食品を管理する
            </Link>

            {filteredRecent.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-gray-500">最近食べたもの</h3>
                <ul className="space-y-2">
                  {filteredRecent.map((r, i) => (
                    <li key={i}>
                      <button
                        disabled={busy}
                        onClick={() => insertEntry(r.name, r.amount, r)}
                        className="card flex w-full flex-col py-2.5 text-left active:bg-gray-50"
                      >
                        <span className="truncate text-sm font-medium">
                          {r.name} {r.amount && <span className="text-xs text-gray-400">{r.amount}</span>}
                        </span>
                        <NutrientLine n={r} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "recipes" && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">料理を選んで、食べた割合（1/4 など）を選びます。</p>
            {filteredRecipes.length === 0 ? (
              <EmptyState>
                自作料理がまだありません。
                <br />
                <Link href="/recipes" className="font-semibold text-brand-600">
                  料理を登録する →
                </Link>
              </EmptyState>
            ) : (
              filteredRecipes.map((r) => (
                <button key={r.id} onClick={() => setPortionRecipe(r)} className="card flex w-full flex-col text-left active:bg-gray-50">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-gray-400">全体（材料{r.count}品）</span>
                  <NutrientLine n={r.total} />
                </button>
              ))
            )}
            <Link href="/recipes" className="block pt-2 text-center text-sm font-semibold text-brand-600">
              自作料理を管理する
            </Link>
          </div>
        )}

        {tab === "manual" && <ManualForm busy={busy} onSubmit={insertEntry} />}
      </div>

      <Sheet open={!!portionFood} onClose={() => setPortionFood(null)} title={portionFood ? `${portionFood.name}（${portionFood.unit}）` : ""}>
        {portionFood && (
          <PortionPicker
            base={portionFood}
            kind="multiple"
            unit={portionFood.unit}
            busy={busy}
            onConfirm={async (p: Portion) => {
              const ok = await insertEntry(portionFood.name, `${portionFood.unit} ${p.label}`, scaleNutrients(portionFood, p.ratio));
              if (ok) setPortionFood(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!portionRecipe} onClose={() => setPortionRecipe(null)} title={portionRecipe ? `${portionRecipe.name}をどれくらい？` : ""}>
        {portionRecipe && (
          <PortionPicker
            base={portionRecipe.total}
            kind="fraction"
            busy={busy}
            onConfirm={async (p: Portion) => {
              const ok = await insertEntry(portionRecipe.name, p.label === "全部" ? "全部" : `${p.label}を食べた`, scaleNutrients(portionRecipe.total, p.ratio));
              if (ok) setPortionRecipe(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function ManualForm({ busy, onSubmit }: { busy: boolean; onSubmit: (name: string, amount: string | null, n: Nutrients) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [nut, setNut] = useState<NutrientStrings>(emptyNutrientStrings);
  const [saveAsFood, setSaveAsFood] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseNutrientStrings(nut);
    const ok = await onSubmit(name, amount || null, n);
    if (!ok) return;
    if (saveAsFood) {
      await createClient().from("foods").insert({ name, unit: amount || "1食", ...n });
    }
    setName("");
    setAmount("");
    setNut(emptyNutrientStrings);
    setSaveAsFood(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <input className="input" placeholder="食品名（例：コンビニおにぎり 鮭）" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="input" placeholder="量（例：1個、200g）" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <NutrientInputs value={nut} onChange={setNut} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={saveAsFood} onChange={(e) => setSaveAsFood(e.target.checked)} />
        マイ食品にも登録する（次から1タップで追加）
      </label>
      <button type="submit" disabled={busy} className="btn-primary w-full py-3">
        記録する
      </button>
    </form>
  );
}
