/**
 * 目標体重までの道のりの計算
 * - 体脂肪 1kg ≒ 7,200kcal として、目標日までに必要な1日のカロリー差を出す
 * - 予測は「最近4週間の体重」の傾き（最小二乗法）を延長する
 */
import { addDays, parseDate, todayStr } from "./date";
import { suggestTargets } from "./nutrition";
import type { Profile, WeightLog } from "./types";

export const KCAL_PER_KG = 7200;

export function daysBetween(a: string, b: string) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export type GoalStatus = {
  start: number;
  startDate: string;
  current: number;
  target: number;
  /** -1=減量 / 1=増量 / 0=維持 */
  direction: -1 | 0 | 1;
  /** 0〜1 */
  progress: number;
  /** 目標まであと何kg（常に正の数） */
  remaining: number;
  reached: boolean;
  goalDate: string | null;
  daysLeft: number | null;
  /** 目標日に間に合わせるための1週間あたりの変化（kg、符号つき） */
  requiredPerWeek: number | null;
  /** 1週間に体重の1%を超える変化が必要 */
  tooFast: boolean;
  /** 目標日なしのとき：無理のないペースでの到達予定日 */
  suggestedDate: string;
  /** 最近の傾き（kg/日）。記録が少ないと null */
  trendPerDay: number | null;
  /** 今のペースが続いた場合の到達予定日 */
  projectedDate: string | null;
  /** 最近は目標と逆向きに動いている */
  wrongWay: boolean;
  /** 目標日（なければ提案日）に間に合わせる1日の目安カロリー */
  dailyKcal: number | null;
  /** 目安の出し方：actual=実際の食事と体重の変化から / formula=計算式から */
  kcalBasis: "actual" | "formula" | null;
  /** 今と比べて1日あたり何kcal変えればいいか（actual のとき） */
  kcalAdjust: number | null;
  /** 目安カロリーが基礎代謝を下回る */
  belowBmr: boolean;
  tdee: number | null;
};

/** 無理のない1週間の変化量（減量：体重の0.5%、増量：0.25%） */
function safePacePerWeek(weight: number, direction: number) {
  return direction < 0 ? weight * 0.005 : weight * 0.0025;
}

/** 最近 days 日間の記録から傾き（kg/日）を求める。記録が3件未満・期間が7日未満なら null */
export function trendPerDay(logs: WeightLog[], today = todayStr(), days = 28): number | null {
  const from = addDays(today, -days);
  const pts = logs.filter((l) => l.logged_on >= from).map((l) => ({ x: daysBetween(from, l.logged_on), y: Number(l.weight_kg) }));
  if (pts.length < 3) return null;
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  if (span < 7) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const num = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return den === 0 ? null : num / den;
}

/**
 * @param avgIntake 最近4週間の1日平均摂取カロリー（記録が7日分以上あるとき）。
 *   あれば「実際に食べた量 × 実際の体重の変化」から目安を出す（計算式より個人差に強い）
 */
export function computeGoal(profile: Profile, logs: WeightLog[], today = todayStr(), avgIntake: number | null = null): GoalStatus | null {
  if (profile.goal_weight_kg == null) return null;
  const sorted = [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  const latest = sorted[sorted.length - 1];
  const current = latest ? Number(latest.weight_kg) : Number(profile.weight_kg ?? 0);
  const target = Number(profile.goal_weight_kg);
  const start = Number(profile.goal_start_weight ?? current);
  const startDate = profile.goal_start_date ?? today;

  const direction: -1 | 0 | 1 = target < start ? -1 : target > start ? 1 : 0;
  const total = target - start;
  const done = current - start;
  const progress = total === 0 ? 1 : Math.min(1, Math.max(0, done / total));
  const remaining = Math.abs(target - current);
  const reached = direction < 0 ? current <= target : direction > 0 ? current >= target : true;

  const goalDate = profile.goal_date ?? null;
  const daysLeft = goalDate ? daysBetween(today, goalDate) : null;
  const requiredPerWeek = daysLeft != null && daysLeft > 0 && !reached ? ((target - current) / daysLeft) * 7 : null;
  const tooFast = requiredPerWeek != null && Math.abs(requiredPerWeek) > current * 0.01;

  const pace = safePacePerWeek(current, direction || -1);
  const suggestedDate = addDays(today, Math.ceil((remaining / pace) * 7));

  const trend = trendPerDay(sorted, today);
  let projectedDate: string | null = null;
  let wrongWay = false;
  if (trend != null && !reached && direction !== 0) {
    if (Math.sign(trend) === direction && Math.abs(trend) > 0.005) {
      const d = Math.ceil(remaining / Math.abs(trend));
      if (d <= 730) projectedDate = addDays(today, d);
    } else if (Math.abs(trend) > 0.005) {
      wrongWay = true;
    }
  }

  // 目安カロリー
  let dailyKcal: number | null = null;
  let belowBmr = false;
  let tdee: number | null = null;
  let kcalBasis: GoalStatus["kcalBasis"] = null;
  let kcalAdjust: number | null = null;
  const untilDays = goalDate && daysLeft != null && daysLeft > 0 ? daysLeft : daysBetween(today, suggestedDate);
  let bmr: number | null = null;
  if (profile.height_cm && profile.age && profile.sex && profile.activity_level) {
    bmr = suggestTargets({
      height_cm: Number(profile.height_cm), weight_kg: current, age: Number(profile.age), sex: profile.sex,
      activity_level: profile.activity_level, goal: "maintain", diet_style: profile.diet_style,
    }).bmr;
  }
  if (!reached && trend != null && avgIntake != null && untilDays > 0) {
    // 実データ方式：必要な変化ペースと今のペースの差を、今の平均摂取量に足し引きする
    const requiredPerDay = (target - current) / untilDays;
    kcalAdjust = Math.round(((requiredPerDay - trend) * KCAL_PER_KG) / 10) * 10;
    dailyKcal = Math.round((avgIntake + kcalAdjust) / 10) * 10;
    kcalBasis = "actual";
    belowBmr = bmr != null && dailyKcal < bmr;
  } else if (profile.height_cm && profile.age && profile.sex && profile.activity_level && !reached) {
    const t = suggestTargets({
      height_cm: Number(profile.height_cm),
      weight_kg: current,
      age: Number(profile.age),
      sex: profile.sex,
      activity_level: profile.activity_level,
      goal: "maintain",
      diet_style: profile.diet_style,
    });
    tdee = t.tdee;
    if (untilDays > 0) {
      const delta = ((target - current) * KCAL_PER_KG) / untilDays;
      dailyKcal = Math.round((t.tdee + delta) / 10) * 10;
      belowBmr = dailyKcal < t.bmr;
      kcalBasis = "formula";
    }
  }

  return {
    start, startDate, current, target, direction, progress, remaining, reached,
    goalDate, daysLeft, requiredPerWeek, tooFast, suggestedDate,
    trendPerDay: trend, projectedDate, wrongWay, dailyKcal, kcalBasis, kcalAdjust, belowBmr, tdee,
  };
}
