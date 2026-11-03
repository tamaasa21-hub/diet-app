"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatJP, todayStr } from "@/lib/date";
import { computeGoal, daysBetween, type GoalStatus } from "@/lib/goal";
import type { Profile, WeightLog } from "@/lib/types";
import { GoalChart } from "./Charts";
import { Sheet, useToast } from "./ui";

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");
const kg = (n: number) => `${sign(n)}${Math.abs(n).toFixed(2)}kg`;

/** 体重ページの「ゴールまでの道のり」 */
export function GoalCard({ profile, userId, logs, onChanged }: { profile: Profile; userId: string; logs: WeightLog[]; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [avgIntake, setAvgIntake] = useState<number | null>(null);
  useEffect(() => {
    // 最近4週間の1日平均摂取カロリー（記録がある日が7日以上のときだけ使う）
    const from = addDays(todayStr(), -28);
    createClient()
      .from("meal_entries")
      .select("eaten_on,kcal")
      .gte("eaten_on", from)
      .lt("eaten_on", todayStr())
      .then(({ data }) => {
        const byDay = new Map<string, number>();
        for (const r of (data as { eaten_on: string; kcal: number }[]) ?? []) byDay.set(r.eaten_on, (byDay.get(r.eaten_on) ?? 0) + Number(r.kcal));
        const days = [...byDay.values()].filter((v) => v > 300); // ほとんど記録していない日は除く
        setAvgIntake(days.length >= 7 ? days.reduce((a, b) => a + b, 0) / days.length : null);
      });
  }, [logs]);
  const status = useMemo(() => computeGoal(profile, logs, todayStr(), avgIntake), [profile, logs, avgIntake]);

  if (!status) {
    return (
      <>
        <button onClick={() => setEditing(true)} className="card flex w-full items-center gap-3 text-left active:scale-[0.99]">
          <span className="text-3xl">🎯</span>
          <span className="flex-1">
            <span className="block font-bold">目標体重を決める</span>
            <span className="block text-xs text-gray-500">ゴールまでの道のりと、今のペースでいつ届くかが見られます</span>
          </span>
          <span className="text-gray-300">›</span>
        </button>
        <GoalSheet open={editing} onClose={() => setEditing(false)} profile={profile} userId={userId} logs={logs} avgIntake={avgIntake} onSaved={onChanged} />
      </>
    );
  }

  const s = status;
  const endDate = s.goalDate ?? s.suggestedDate;
  const sortedLogs = [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  const chartFrom = [s.startDate, addDays(todayStr(), -120)].sort()[1];
  const latest = sortedLogs[sortedLogs.length - 1];

  async function applyKcal() {
    if (!s.dailyKcal) return;
    const p = Number(profile.target_protein ?? 0);
    const f = Number(profile.target_fat ?? 0);
    const carbs = Math.max(0, Math.round((s.dailyKcal - p * 4 - f * 9) / 4));
    if (!confirm(`1日の目標を ${s.dailyKcal.toLocaleString()}kcal（炭水化物 ${carbs}g）に変更しますか？\nタンパク質・脂質の目標はそのままです。`)) return;
    const { error } = await createClient().from("profiles").update({ target_kcal: s.dailyKcal, target_carbs: carbs }).eq("id", userId);
    if (error) return toast(`エラー：${error.message}`);
    toast("目標カロリーを変更しました");
    await onChanged();
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">🎯 ゴールまでの道のり</h2>
        <button onClick={() => setEditing(true)} className="text-sm text-brand-600">
          変更
        </button>
      </div>

      {/* スタート → 今 → 目標 */}
      <div className="mt-4">
        <div className="relative h-3 rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${s.progress * 100}%` }} />
          <div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-brand-600 shadow"
            style={{ left: `${s.progress * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-500 tabular-nums">
          <span>
            スタート
            <br />
            <b className="text-sm text-gray-700">{s.start.toFixed(1)}kg</b>
          </span>
          <span className="text-center">
            今
            <br />
            <b className="text-sm text-gray-900">{s.current.toFixed(1)}kg</b>
          </span>
          <span className="text-right">
            目標
            <br />
            <b className="text-sm text-gray-700">{s.target.toFixed(1)}kg</b>
          </span>
        </div>
      </div>

      {s.reached ? (
        <p className="mt-4 rounded-xl bg-brand-50 p-3 text-center font-bold text-brand-700">🎉 目標達成！おめでとう！</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-gray-50 py-2">
            <div className="text-xs text-gray-500">あと</div>
            <div className="text-xl font-extrabold tabular-nums">{s.remaining.toFixed(1)}kg</div>
            <div className="text-[11px] text-gray-400">{Math.round(s.progress * 100)}% 達成</div>
          </div>
          <div className="rounded-xl bg-gray-50 py-2">
            {s.goalDate ? (
              <>
                <div className="text-xs text-gray-500">目標日 {formatJP(s.goalDate, false)}</div>
                <div className="text-xl font-extrabold tabular-nums">{s.daysLeft != null && s.daysLeft >= 0 ? `あと${s.daysLeft}日` : "期限切れ"}</div>
                {s.requiredPerWeek != null && <div className="text-[11px] text-gray-400">必要なペース 週{kg(s.requiredPerWeek)}</div>}
              </>
            ) : (
              <>
                <div className="text-xs text-gray-500">無理のないペースなら</div>
                <div className="text-xl font-extrabold">{formatJP(s.suggestedDate, false)}</div>
                <div className="text-[11px] text-gray-400">ごろ到達（目標日は未設定）</div>
              </>
            )}
          </div>
        </div>
      )}

      {!s.reached && <PaceMessage s={s} />}

      {sortedLogs.length > 0 && (
        <div className="-mx-2 mt-4">
          <GoalChart
            logs={sortedLogs.filter((l) => l.logged_on >= chartFrom).map((l) => ({ date: l.logged_on, weight: Number(l.weight_kg) }))}
            start={s.start}
            startDate={s.startDate}
            target={s.target}
            endDate={endDate}
            projection={
              s.projectedDate && latest
                ? { from: { date: latest.logged_on, weight: Number(latest.weight_kg) }, to: { date: s.projectedDate, weight: s.target } }
                : null
            }
          />
        </div>
      )}

      {!s.reached && s.dailyKcal != null && (
        <div className="mt-4 rounded-xl border border-gray-100 p-3">
          <p className="text-sm">
            {s.goalDate ? "目標日に間に合わせるなら" : `${formatJP(s.suggestedDate, false)}ごろに届くペースなら`}、1日の目安は
            <b className="mx-1 text-lg">{s.dailyKcal.toLocaleString()}kcal</b>
          </p>
          {s.kcalBasis === "actual" && s.kcalAdjust != null && avgIntake != null ? (
            <p className="mt-1 text-xs text-gray-600">
              最近4週間の平均 {Math.round(avgIntake).toLocaleString()}kcal と体重の変化から計算：
              {s.belowBmr ? null : Math.abs(s.kcalAdjust) < 30 ? <b>今のままでOK！</b> : <b>1日 {s.kcalAdjust > 0 ? "+" : "−"}{Math.abs(s.kcalAdjust)}kcal</b>}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              計算式による目安です（今の目標 {Number(profile.target_kcal ?? 0).toLocaleString()}kcal）。食事を7日分以上記録すると、実際の食事と体重の変化からより正確に計算します。
            </p>
          )}
          {s.belowBmr ? (
            <p className="mt-1 text-xs text-red-600">⚠ 基礎代謝を下回る量です。体調や練習のパフォーマンスを崩しやすいので、目標日をのばすか、食べる量を見直してください。</p>
          ) : (
            Math.abs(s.dailyKcal - Number(profile.target_kcal ?? 0)) >= 30 && (
              <button onClick={applyKcal} className="btn-secondary mt-2 w-full text-sm">
                この値を1日の目標カロリーに反映する
              </button>
            )
          )}
          <p className="mt-1 text-[11px] text-gray-400">体脂肪1kg ≒ 7,200kcal として計算した目安です。体重は水分などで日々上下するので、数週間単位で見てください。</p>
        </div>
      )}

      <GoalSheet open={editing} onClose={() => setEditing(false)} profile={profile} userId={userId} logs={logs} avgIntake={avgIntake} onSaved={onChanged} />
    </section>
  );
}

function PaceMessage({ s }: { s: GoalStatus }) {
  if (s.projectedDate) {
    const diff = s.goalDate ? daysBetween(s.projectedDate, s.goalDate) : null;
    return (
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        📈 今のペースなら <b>{formatJP(s.projectedDate, false)}ごろ</b> に到達
        {diff != null && (diff >= 0 ? <>（予定より{diff}日早い！）</> : <>（予定より{-diff}日おそい）</>)}
        {s.trendPerDay != null && <span className="block text-xs text-amber-700">最近4週間のペース：週{kg(s.trendPerDay * 7)}</span>}
      </p>
    );
  }
  if (s.wrongWay) {
    return <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">最近4週間は、目標と逆の方向に動いています。食事の記録を見直してみましょう。</p>;
  }
  return <p className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-500">体重を1週間以上・3回以上記録すると、今のペースでいつ届くかを予測します。</p>;
}

/* ---------------- 目標の設定シート ---------------- */
const QUICK = [
  { label: "決めない", months: 0 },
  { label: "1か月", months: 1 },
  { label: "2か月", months: 2 },
  { label: "3か月", months: 3 },
  { label: "6か月", months: 6 },
];

function GoalSheet({
  open,
  onClose,
  profile,
  userId,
  logs,
  avgIntake,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  userId: string;
  logs: WeightLog[];
  avgIntake: number | null;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const hasGoal = profile.goal_weight_kg != null;
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [restart, setRestart] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget(profile.goal_weight_kg != null ? String(profile.goal_weight_kg) : "");
    setDate(profile.goal_date ?? "");
    setRestart(false);
  }, [open, profile]);

  const sorted = [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  const current = sorted.length ? Number(sorted[sorted.length - 1].weight_kg) : Number(profile.weight_kg ?? 0);
  const newStart = !hasGoal || restart;

  const preview = useMemo(() => {
    const t = Number(target);
    if (!t || t < 20 || t > 300) return null;
    return computeGoal(
      {
        ...profile,
        goal_weight_kg: t,
        goal_date: date || null,
        goal_start_weight: newStart ? current : profile.goal_start_weight,
        goal_start_date: newStart ? todayStr() : profile.goal_start_date,
      },
      logs,
      todayStr(),
      avgIntake,
    );
  }, [target, date, newStart, current, profile, logs, avgIntake]);

  function quick(months: number) {
    if (months === 0) return setDate("");
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    const update: Partial<Profile> = { goal_weight_kg: Number(target), goal_date: date || null };
    if (newStart) {
      update.goal_start_weight = current;
      update.goal_start_date = todayStr();
    }
    const { error } = await createClient().from("profiles").update(update).eq("id", userId);
    setBusy(false);
    if (error) {
      return toast(error.message.includes("goal_") ? "準備ができていません：管理者が SQL（003_goal_weight.sql）を実行する必要があります" : `エラー：${error.message}`);
    }
    toast("目標を保存しました");
    await onSaved();
    onClose();
  }

  async function remove() {
    if (!confirm("目標体重の設定を消しますか？（体重の記録は消えません）")) return;
    setBusy(true);
    await createClient().from("profiles").update({ goal_weight_kg: null, goal_date: null, goal_start_weight: null, goal_start_date: null }).eq("id", userId);
    setBusy(false);
    await onSaved();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={hasGoal ? "目標を変更" : "🎯 目標体重を決める"}>
      <div className="space-y-4">
        <p className="text-xs text-gray-500">今の体重：{current ? `${current.toFixed(1)}kg` : "未記録（先に体重を記録してください）"}</p>
        <label className="block">
          <span className="label">目標体重</span>
          <div className="relative">
            <input type="number" inputMode="decimal" step="0.1" className="input pr-10" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="例：65" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">kg</span>
          </div>
        </label>

        <div>
          <span className="label">目標日（任意）</span>
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button key={q.label} type="button" onClick={() => quick(q.months)} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-200">
                {q.label}
              </button>
            ))}
          </div>
          <input type="date" className="input" min={addDays(todayStr(), 1)} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {hasGoal && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={restart} onChange={(e) => setRestart(e.target.checked)} />
            今日の体重（{current.toFixed(1)}kg）からスタートし直す
          </label>
        )}

        {preview && !preview.reached && (
          <div className="rounded-xl bg-gray-50 p-3 text-sm">
            <p>
              {preview.direction < 0 ? "減量" : "増量"} {preview.remaining.toFixed(1)}kg
              {preview.requiredPerWeek != null ? (
                <>
                  ・必要なペース <b>週{kg(preview.requiredPerWeek)}</b>
                </>
              ) : (
                <>
                  ・無理のないペースなら <b>{formatJP(preview.suggestedDate, false)}ごろ</b> 到達
                </>
              )}
            </p>
            {preview.tooFast && (
              <p className="mt-1 text-xs text-red-600">
                ⚠ 1週間に体重の1%を超えるペースです。体調や練習のパフォーマンスを崩しやすいので、目標日をのばすのがおすすめです（目安：{formatJP(preview.suggestedDate, false)}ごろ）。
              </p>
            )}
            {preview.dailyKcal != null && (
              <p className="mt-1 text-xs text-gray-500">
                1日の目安：{preview.dailyKcal.toLocaleString()}kcal{preview.belowBmr && <span className="text-red-600">（基礎代謝を下回るためおすすめしません）</span>}
              </p>
            )}
          </div>
        )}

        <button onClick={save} disabled={!preview || busy || !current} className="btn-primary w-full py-3">
          保存する
        </button>
        {hasGoal && (
          <button onClick={remove} disabled={busy} className="w-full text-sm text-gray-400">
            目標を消す
          </button>
        )}
      </div>
    </Sheet>
  );
}
