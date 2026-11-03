"use client";

import { useEffect, useState } from "react";
import { NutrientInputs, Sheet, emptyNutrientStrings, parseNutrientStrings, toNutrientStrings, type NutrientStrings } from "./ui";
import type { Nutrients } from "@/lib/types";

export type FoodFormValue = Nutrients & { name: string; unit: string };

/** 食品（または料理の材料）を入力するシート */
export function FoodFormSheet({
  open,
  title,
  initial,
  unitLabel = "単位",
  unitPlaceholder = "例：1杯、1個、100g",
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  title: string;
  initial?: FoodFormValue | null;
  unitLabel?: string;
  unitPlaceholder?: string;
  onClose: () => void;
  onSubmit: (v: FoodFormValue) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [nut, setNut] = useState<NutrientStrings>(emptyNutrientStrings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setUnit(initial?.unit ?? "");
    setNut(initial ? toNutrientStrings(initial) : emptyNutrientStrings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSubmit({ name, unit, ...parseNutrientStrings(nut) });
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">名前</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：プロテイン" required />
        </label>
        <label className="block">
          <span className="label">{unitLabel}</span>
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={unitPlaceholder} />
        </label>
        <NutrientInputs value={nut} onChange={setNut} />
        <div className="flex gap-2 pt-2">
          {onDelete && (
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`「${name}」を削除しますか？`)) return;
                setBusy(true);
                await onDelete();
                setBusy(false);
              }}
            >
              削除
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            保存
          </button>
        </div>
      </form>
    </Sheet>
  );
}
