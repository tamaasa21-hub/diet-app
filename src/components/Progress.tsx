import { fmt } from "@/lib/nutrition";

/** カロリーの残りを大きく表示するリング */
export function KcalRing({ eaten, target }: { eaten: number; target: number }) {
  const remaining = target - eaten;
  const over = remaining < 0;
  const ratio = target > 0 ? Math.min(eaten / target, 1) : 0;
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-48 w-48">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={over ? "#ef4444" : "#10b981"}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-gray-500">{over ? "オーバー" : "あと"}</span>
        <span className={`text-4xl font-extrabold tabular-nums ${over ? "text-red-500" : "text-gray-900"}`}>
          {fmt(Math.abs(remaining), "kcal")}
        </span>
        <span className="text-xs text-gray-500">kcal</span>
        <span className="mt-1 text-[11px] text-gray-400">
          {fmt(eaten, "kcal")} / {fmt(target, "kcal")}
        </span>
      </div>
    </div>
  );
}

/** P・F・C の残りを表示するバー */
export function MacroBar({
  label,
  eaten,
  target,
  color,
  mode = "target",
}: {
  label: string;
  eaten: number;
  target: number;
  color: string;
  /** target: 目標まで食べたい（タンパク質） / limit: 上限（脂質） / neutral: 目安（炭水化物） */
  mode?: "target" | "limit" | "neutral";
}) {
  const remaining = target - eaten;
  const over = remaining < 0;
  const ratio = target > 0 ? Math.min(eaten / target, 1) : 0;
  const reached = mode === "target" && over;
  const warn = mode === "limit" && over;
  return (
    <div>
      <div className="whitespace-nowrap text-sm font-semibold">{label}</div>
      <div className="my-1 h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${ratio * 100}%`, background: warn ? "#ef4444" : color }} />
      </div>
      <div className={`text-right text-base font-bold tabular-nums ${warn ? "text-red-500" : reached ? "text-brand-600" : over ? "text-amber-600" : ""}`}>
        {!over ? `あと${fmt(remaining)}g` : warn ? `+${fmt(-remaining)}g超過` : reached ? "達成！" : `+${fmt(-remaining)}g`}
      </div>
      <div className="text-right text-[11px] text-gray-400 tabular-nums">
        {fmt(eaten)} / {fmt(target)}g
      </div>
    </div>
  );
}
