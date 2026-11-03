"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MEAL_TYPES } from "@/lib/types";
import { todayStr } from "@/lib/date";
import { Sheet, useToast } from "./ui";

type Row = Record<string, unknown>;

/** 1000件ずつ全部取ってくる（Supabase は1回の取得が最大1000件） */
async function fetchAll(table: string, columns: string, order: string): Promise<Row[]> {
  const supabase = createClient();
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order(order).range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...((data as unknown as Row[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

function toCsv(header: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // 先頭の BOM で Excel でも文字化けしない
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const mealLabel = (v: unknown) => MEAL_TYPES.find((m) => m.value === v)?.label ?? String(v);

const EXPORTS: { key: string; label: string; file: string; run: () => Promise<[string, string]> }[] = [
  {
    key: "meals",
    file: "meals",
    label: "🍽 食事の記録",
    run: async () => {
      const rows = await fetchAll("meal_entries", "eaten_on,meal_type,name,amount,kcal,protein,fat,carbs,created_at", "eaten_on");
      return [
        "食事記録",
        toCsv(
          ["日付", "食事区分", "食品名", "量", "kcal", "タンパク質(g)", "脂質(g)", "炭水化物(g)"],
          rows.map((r) => [r.eaten_on, mealLabel(r.meal_type), r.name, r.amount, r.kcal, r.protein, r.fat, r.carbs]),
        ),
      ];
    },
  },
  {
    key: "weight",
    file: "weight",
    label: "⚖️ 体重の記録",
    run: async () => {
      const rows = await fetchAll("weight_logs", "logged_on,weight_kg", "logged_on");
      return ["体重記録", toCsv(["日付", "体重(kg)"], rows.map((r) => [r.logged_on, r.weight_kg]))];
    },
  },
  {
    key: "foods",
    file: "my_foods",
    label: "🥚 マイ食品",
    run: async () => {
      const rows = await fetchAll("foods", "name,unit,kcal,protein,fat,carbs", "name");
      return ["マイ食品", toCsv(["食品名", "単位", "kcal", "タンパク質(g)", "脂質(g)", "炭水化物(g)"], rows.map((r) => [r.name, r.unit, r.kcal, r.protein, r.fat, r.carbs]))];
    },
  },
  {
    key: "recipes",
    file: "recipes",
    label: "🍲 自作料理",
    run: async () => {
      const [recipes, ings] = await Promise.all([
        fetchAll("recipes", "id,name", "name"),
        fetchAll("recipe_ingredients", "recipe_id,name,amount,kcal,protein,fat,carbs,created_at", "created_at"),
      ]);
      const nameOf = new Map(recipes.map((r) => [r.id, r.name]));
      return [
        "自作料理",
        toCsv(
          ["料理名", "材料", "量", "kcal", "タンパク質(g)", "脂質(g)", "炭水化物(g)"],
          ings.map((i) => [nameOf.get(i.recipe_id), i.name, i.amount, i.kcal, i.protein, i.fat, i.carbs]),
        ),
      ];
    },
  },
];

/** 設定画面：データを書き出す */
export function DataExport() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(e: (typeof EXPORTS)[number]) {
    setBusy(e.key);
    try {
      const [name, csv] = await e.run();
      download(`mogulog_${e.file}_${todayStr()}.csv`, csv);
      toast(`${name}を書き出しました`);
    } catch (err) {
      toast(`書き出しに失敗しました：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <h2 className="font-bold">データを書き出す</h2>
      <p className="mt-1 text-xs text-gray-500">記録をCSVファイルでダウンロードできます。Excel や Google スプレッドシートで開けます。</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {EXPORTS.map((e) => (
          <button key={e.key} onClick={() => run(e)} disabled={busy !== null} className="btn-secondary text-sm">
            {busy === e.key ? "準備中…" : e.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** 設定画面：アカウントを削除 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setBusy(false);
      setError(
        error.message.includes("delete_my_account")
          ? "削除機能がまだ準備されていません。管理者に連絡してください。"
          : `削除できませんでした：${error.message}`,
      );
      return;
    }
    await supabase.auth.signOut().catch(() => {});
    window.location.href = "/login?deleted=1";
  }

  return (
    <section className="card border-2 border-red-50">
      <h2 className="font-bold text-red-600">アカウントを削除</h2>
      <p className="mt-1 text-xs text-gray-500">アカウントと、食事・体重・マイ食品・自作料理のすべての記録を完全に削除します。元には戻せません。</p>
      <button onClick={() => setOpen(true)} className="btn-danger mt-3 w-full">
        アカウントを削除する
      </button>

      <Sheet
        open={open}
        onClose={() => {
          if (busy) return;
          setOpen(false);
          setConfirmText("");
          setError(null);
        }}
        title="本当に削除しますか？"
      >
        <div className="space-y-3">
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            すべての記録が完全に消え、<b>元に戻すことはできません</b>。必要なら先に「データを書き出す」で保存してください。
          </p>
          <label className="block">
            <span className="label">確認のため「削除」と入力してください</span>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="削除" />
          </label>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          <button onClick={remove} disabled={confirmText.trim() !== "削除" || busy} className="btn w-full bg-red-600 py-3 text-white">
            {busy ? "削除中…" : "完全に削除する"}
          </button>
        </div>
      </Sheet>
    </section>
  );
}
