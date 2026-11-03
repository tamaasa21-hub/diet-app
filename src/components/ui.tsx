"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Nutrients } from "@/lib/types";
import { fmt } from "@/lib/nutrition";

/* ---------- ページ見出し ---------- */
export function PageHeader({ title, right, back }: { title: string; right?: React.ReactNode; back?: string }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-2 bg-[#f5f7f6]/95 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
      {back && (
        <a href={back} className="-ml-2 rounded-full p-2 text-gray-500" aria-label="戻る">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </a>
      )}
      <h1 className="flex-1 text-xl font-bold">{title}</h1>
      {right}
    </header>
  );
}

/* ---------- 下から出るシート（モーダル） ---------- */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="pb-safe max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-4 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400" aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="pb-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------- 数値入力 ---------- */
export function NumberInput({
  label,
  value,
  onChange,
  unit,
  step = "0.1",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min="0"
          className="input pr-12"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{unit}</span>}
      </div>
    </label>
  );
}

/** kcal・P・F・C の4つの入力欄 */
export type NutrientStrings = { kcal: string; protein: string; fat: string; carbs: string };
export const emptyNutrientStrings: NutrientStrings = { kcal: "", protein: "", fat: "", carbs: "" };
export function toNutrientStrings(n: Nutrients): NutrientStrings {
  return { kcal: String(Number(n.kcal)), protein: String(Number(n.protein)), fat: String(Number(n.fat)), carbs: String(Number(n.carbs)) };
}
export function parseNutrientStrings(s: NutrientStrings): Nutrients {
  const n = (v: string) => (v === "" || isNaN(Number(v)) ? 0 : Number(v));
  return { kcal: n(s.kcal), protein: n(s.protein), fat: n(s.fat), carbs: n(s.carbs) };
}

export function NutrientInputs({ value, onChange }: { value: NutrientStrings; onChange: (v: NutrientStrings) => void }) {
  const set = (k: keyof NutrientStrings) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberInput label="カロリー" unit="kcal" step="1" value={value.kcal} onChange={set("kcal")} required />
      <NumberInput label="タンパク質 (P)" unit="g" value={value.protein} onChange={set("protein")} />
      <NumberInput label="脂質 (F)" unit="g" value={value.fat} onChange={set("fat")} />
      <NumberInput label="炭水化物 (C)" unit="g" value={value.carbs} onChange={set("carbs")} />
    </div>
  );
}

/** 「118kcal P21 F1.5 C3」のような1行表示 */
export function NutrientLine({ n, className = "" }: { n: Nutrients; className?: string }) {
  return (
    <span className={`text-xs text-gray-500 ${className}`}>
      <b className="font-semibold text-gray-700">{fmt(n.kcal, "kcal")}</b>kcal
      <span className="ml-1.5 text-protein-ink">P{fmt(n.protein)}</span>
      <span className="ml-1.5 text-fat-ink">F{fmt(n.fat)}</span>
      <span className="ml-1.5 text-carbs-ink">C{fmt(n.carbs)}</span>
    </span>
  );
}

/* ---------- 選択ボタン群 ---------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-gray-100 p-1">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            value === o.value ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- トースト通知 ---------- */
type ToastItem = { id: number; message: string; action?: { label: string; onClick: () => void } };
const ToastContext = createContext<(message: string, action?: ToastItem["action"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((message: string, action?: ToastItem["action"]) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, action });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div key={toast.id} className="flex items-center gap-3 rounded-full bg-gray-900 px-5 py-3 text-sm text-white shadow-lg">
            {toast.message}
            {toast.action && (
              <button
                className="font-bold text-brand-100"
                onClick={() => {
                  toast.action!.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

/* ---------- 日付切り替え ---------- */
export function DateStepper({ label, onPrev, onNext, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-2 py-1.5 shadow-sm">
      <button onClick={onPrev} className="rounded-lg px-3 py-1.5 text-lg text-gray-500 active:bg-gray-100" aria-label="前へ">
        ‹
      </button>
      <span className="font-semibold">{label}</span>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-lg px-3 py-1.5 text-lg text-gray-500 active:bg-gray-100 disabled:opacity-30"
        aria-label="次へ"
      >
        ›
      </button>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">{children}</p>;
}
