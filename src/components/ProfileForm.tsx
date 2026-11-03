"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACTIVITY_OPTIONS, DIET_STYLE_OPTIONS, GOAL_OPTIONS, suggestTargets } from "@/lib/nutrition";
import type { ActivityLevel, DietStyle, Goal, Profile } from "@/lib/types";
import { NumberInput } from "./ui";
import { todayStr } from "@/lib/date";

type Props = {
  userId: string;
  initial?: Partial<Profile>;
  submitLabel: string;
  onSaved: () => void;
};

export function ProfileForm({ userId, initial, submitLabel, onSaved }: Props) {
  const [name, setName] = useState(initial?.display_name ?? "");
  const [height, setHeight] = useState(initial?.height_cm?.toString() ?? "");
  const [weight, setWeight] = useState(initial?.weight_kg?.toString() ?? "");
  const [age, setAge] = useState(initial?.age?.toString() ?? "");
  const [sex, setSex] = useState<"male" | "female">(initial?.sex ?? "male");
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity_level ?? "moderate");
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? "maintain");
  const [dietStyle, setDietStyle] = useState<DietStyle>(initial?.diet_style ?? "balanced");

  const [kcal, setKcal] = useState(initial?.target_kcal?.toString() ?? "");
  const [protein, setProtein] = useState(initial?.target_protein?.toString() ?? "");
  const [fat, setFat] = useState(initial?.target_fat?.toString() ?? "");
  const [carbs, setCarbs] = useState(initial?.target_carbs?.toString() ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyValid = Number(height) > 0 && Number(weight) > 0 && Number(age) > 0;
  const suggestion = useMemo(
    () =>
      bodyValid
        ? suggestTargets({
            height_cm: Number(height),
            weight_kg: Number(weight),
            age: Number(age),
            sex,
            activity_level: activity,
            goal,
            diet_style: dietStyle,
          })
        : null,
    [bodyValid, height, weight, age, sex, activity, goal, dietStyle],
  );

  function applySuggestion() {
    if (!suggestion) return;
    setKcal(String(suggestion.kcal));
    setProtein(String(suggestion.protein));
    setFat(String(suggestion.fat));
    setCarbs(String(suggestion.carbs));
  }

  // P・F から残りを炭水化物に
  function fillCarbs() {
    const c = Math.max(0, Math.round((Number(kcal) - Number(protein) * 4 - Number(fat) * 9) / 4));
    setCarbs(String(c));
  }

  const targetsFilled = [kcal, protein, fat, carbs].every((v) => v !== "" && !isNaN(Number(v)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!targetsFilled) {
      setError("目標値を入力するか「提案値を使う」を押してください。");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: name || null,
      height_cm: Number(height),
      weight_kg: Number(weight),
      age: Number(age),
      sex,
      activity_level: activity,
      goal,
      diet_style: dietStyle,
      target_kcal: Math.round(Number(kcal)),
      target_protein: Number(protein),
      target_fat: Number(fat),
      target_carbs: Number(carbs),
      onboarded: true,
    });
    if (!error && initial?.weight_kg == null) {
      // 初回登録時は体重記録にも入れておく
      await supabase.from("weight_logs").upsert(
        { user_id: userId, logged_on: todayStr(), weight_kg: Number(weight) },
        { onConflict: "user_id,logged_on" },
      );
    }
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <section className="card space-y-3">
        <h2 className="font-bold">からだの情報</h2>
        <label className="block">
          <span className="label">ニックネーム（任意）</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <NumberInput label="身長" unit="cm" value={height} onChange={setHeight} required />
          <NumberInput label="体重" unit="kg" value={weight} onChange={setWeight} required />
          <NumberInput label="年齢" unit="歳" step="1" value={age} onChange={setAge} required />
        </div>
        <div>
          <span className="label">性別（代謝の計算に使います）</span>
          <ChoiceGrid
            cols={2}
            value={sex}
            onChange={setSex}
            options={[
              { value: "male", label: "男性" },
              { value: "female", label: "女性" },
            ]}
          />
        </div>
        <div>
          <span className="label">運動量</span>
          <ChoiceGrid cols={1} value={activity} onChange={setActivity} options={ACTIVITY_OPTIONS} />
        </div>
        <div>
          <span className="label">目的</span>
          <ChoiceGrid cols={3} value={goal} onChange={setGoal} options={GOAL_OPTIONS} />
        </div>
        <div>
          <span className="label">食事スタイル</span>
          <ChoiceGrid cols={2} value={dietStyle} onChange={setDietStyle} options={DIET_STYLE_OPTIONS} />
        </div>
      </section>

      {suggestion && (
        <section className="card border-2 border-brand-100">
          <h2 className="font-bold">あなたへの提案</h2>
          <p className="mt-1 text-xs text-gray-500">
            基礎代謝 約{suggestion.bmr.toLocaleString()}kcal × 運動量 ＝ 消費 約{suggestion.tdee.toLocaleString()}kcal/日
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <Stat label="kcal" value={suggestion.kcal} />
            <Stat label="P" value={`${suggestion.protein}g`} className="text-protein-ink" />
            <Stat label="F" value={`${suggestion.fat}g`} className="text-fat-ink" />
            <Stat label="C" value={`${suggestion.carbs}g`} className="text-carbs-ink" />
          </div>
          <button type="button" onClick={applySuggestion} className="btn-primary mt-3 w-full">
            提案値を使う
          </button>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-bold">1日の目標</h2>
        <p className="text-xs text-gray-500">提案値をそのまま使っても、自分で好きな数字に変えてもOKです。</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="カロリー" unit="kcal" step="1" value={kcal} onChange={setKcal} required />
          <NumberInput label="タンパク質" unit="g" value={protein} onChange={setProtein} required />
          <NumberInput label="脂質" unit="g" value={fat} onChange={setFat} required />
          <NumberInput label="炭水化物" unit="g" value={carbs} onChange={setCarbs} required />
        </div>
        <button type="button" onClick={fillCarbs} className="text-sm font-semibold text-brand-600">
          カロリー・P・F から炭水化物を自動計算
        </button>
      </section>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary w-full py-3.5 text-lg">
        {saving ? "保存中…" : submitLabel}
      </button>
    </form>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 py-2">
      <div className={`text-lg font-bold ${className}`}>{value}</div>
      <div className="text-[11px] text-gray-400">{label}</div>
    </div>
  );
}

function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  cols,
}: {
  options: { value: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  cols: 1 | 2 | 3;
}) {
  const grid = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={`grid gap-2 ${grid}`}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-xl border-2 px-3 py-2 text-left transition ${
            value === o.value ? "border-brand-500 bg-brand-50" : "border-gray-100 bg-white"
          }`}
        >
          <div className="text-sm font-semibold">{o.label}</div>
          {o.desc && <div className="text-[11px] text-gray-500">{o.desc}</div>}
        </button>
      ))}
    </div>
  );
}
