import type { ActivityLevel, DietStyle, Goal, Nutrients } from "./types";

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; desc: string; factor: number }[] = [
  { value: "low", label: "ほとんど運動しない", desc: "デスクワーク中心", factor: 1.2 },
  { value: "light", label: "軽い運動", desc: "週1〜3回の軽い運動", factor: 1.375 },
  { value: "moderate", label: "普通", desc: "週3〜5回の運動", factor: 1.55 },
  { value: "high", label: "活発", desc: "ほぼ毎日の部活・トレーニング", factor: 1.725 },
  { value: "very_high", label: "非常に活発", desc: "1日2回の練習など", factor: 1.9 },
];

export const GOAL_OPTIONS: { value: Goal; label: string; desc: string }[] = [
  { value: "lose", label: "減量", desc: "消費より約20%少なく" },
  { value: "maintain", label: "維持", desc: "消費と同じくらい" },
  { value: "gain", label: "増量", desc: "消費より約10%多く" },
];

export const DIET_STYLE_OPTIONS: { value: DietStyle; label: string; desc: string }[] = [
  { value: "balanced", label: "バランス", desc: "脂質 = カロリーの25%" },
  { value: "low_fat", label: "ローファット", desc: "脂質 = カロリーの15%" },
];

export type BodyInput = {
  height_cm: number;
  weight_kg: number;
  age: number;
  sex: "male" | "female";
  activity_level: ActivityLevel;
  goal: Goal;
  diet_style: DietStyle;
};

/**
 * 1日の目標を提案する
 * - 基礎代謝: Mifflin-St Jeor 式
 * - 消費カロリー: 基礎代謝 × 活動係数
 * - タンパク質: 体重 × (減量2.0 / 維持1.6 / 増量1.8) g
 * - 脂質: カロリーの 25%（ローファットは 15%）
 * - 炭水化物: 残りのカロリー
 */
export function suggestTargets(b: BodyInput) {
  const bmr = 10 * b.weight_kg + 6.25 * b.height_cm - 5 * b.age + (b.sex === "male" ? 5 : -161);
  const factor = ACTIVITY_OPTIONS.find((a) => a.value === b.activity_level)?.factor ?? 1.55;
  const tdee = bmr * factor;
  const goalFactor = b.goal === "lose" ? 0.8 : b.goal === "gain" ? 1.1 : 1;
  const kcal = Math.round((tdee * goalFactor) / 10) * 10;

  const proteinPerKg = b.goal === "lose" ? 2.0 : b.goal === "gain" ? 1.8 : 1.6;
  const protein = Math.round(b.weight_kg * proteinPerKg);
  const fatRatio = b.diet_style === "low_fat" ? 0.15 : 0.25;
  const fat = Math.round((kcal * fatRatio) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, fat, carbs };
}

export const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

export function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + Number(i.kcal),
      protein: acc.protein + Number(i.protein),
      fat: acc.fat + Number(i.fat),
      carbs: acc.carbs + Number(i.carbs),
    }),
    { ...ZERO },
  );
}

export function scaleNutrients(n: Nutrients, ratio: number): Nutrients {
  return {
    kcal: round1(Number(n.kcal) * ratio),
    protein: round1(Number(n.protein) * ratio),
    fat: round1(Number(n.fat) * ratio),
    carbs: round1(Number(n.carbs) * ratio),
  };
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** 表示用: kcal は整数、g は小数1桁（.0 は省略） */
export function fmt(n: number, unit: "kcal" | "g" = "g") {
  if (unit === "kcal") return Math.round(n).toLocaleString();
  const r = round1(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
