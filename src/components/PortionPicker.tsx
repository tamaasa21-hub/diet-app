"use client";

import { useState } from "react";
import type { Nutrients } from "@/lib/types";
import { scaleNutrients } from "@/lib/nutrition";
import { NutrientLine } from "./ui";

export type Portion = { ratio: number; label: string };

const FRACTIONS: Portion[] = [
  { ratio: 1 / 4, label: "1/4" },
  { ratio: 1 / 3, label: "1/3" },
  { ratio: 1 / 2, label: "1/2" },
  { ratio: 2 / 3, label: "2/3" },
  { ratio: 3 / 4, label: "3/4" },
  { ratio: 1, label: "全部" },
];
const MULTIPLES: Portion[] = [
  { ratio: 0.5, label: "×0.5" },
  { ratio: 1, label: "×1" },
  { ratio: 1.5, label: "×1.5" },
  { ratio: 2, label: "×2" },
  { ratio: 3, label: "×3" },
];

/**
 * 量の選び方
 * - fraction: 自作料理用「全体の何分の1を食べたか」
 * - multiple: マイ食品用「何個（何杯）食べたか」
 */
export function PortionPicker({
  base,
  kind,
  unit,
  onConfirm,
  busy,
}: {
  base: Nutrients;
  kind: "fraction" | "multiple";
  unit?: string;
  onConfirm: (p: Portion) => void;
  busy?: boolean;
}) {
  const presets = kind === "fraction" ? FRACTIONS : MULTIPLES;
  const [selected, setSelected] = useState<Portion>(kind === "fraction" ? FRACTIONS[2] : MULTIPLES[1]);
  const [custom, setCustom] = useState("");

  const customPortion = (): Portion | null => {
    const v = Number(custom);
    if (!custom || isNaN(v) || v <= 0) return null;
    return kind === "fraction" ? { ratio: v / 100, label: `${v}%` } : { ratio: v, label: `×${v}` };
  };
  const portion = customPortion() ?? selected;
  const result = scaleNutrients(base, portion.ratio);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setSelected(p);
              setCustom("");
            }}
            className={`rounded-xl border-2 py-3 text-lg font-bold ${
              !customPortion() && selected.label === p.label ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-100"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-gray-500">{kind === "fraction" ? "自由入力" : "数量を入力"}</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          className="input"
          placeholder={kind === "fraction" ? "例：40" : "例：1.2"}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <span className="shrink-0 text-gray-500">{kind === "fraction" ? "%" : unit ? `× ${unit}` : "倍"}</span>
      </label>
      <div className="rounded-xl bg-gray-50 p-3 text-center">
        <NutrientLine n={result} className="text-sm" />
      </div>
      <button type="button" disabled={busy} onClick={() => onConfirm(portion)} className="btn-primary w-full py-3">
        この量で記録する
      </button>
    </div>
  );
}
