"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseFoodText } from "@/lib/parseFoodText";
import { recognizeLabel, type LabelResult } from "@/lib/labelOcr";
import { fmt, round1, scaleNutrients, sumNutrients } from "@/lib/nutrition";
import { MEAL_TYPES, type Food, type MealType, type Nutrients } from "@/lib/types";
import { NutrientLine, Sheet, useToast } from "./ui";
import { useSpeech } from "./useSpeech";

type Draft = Nutrients & { name: string; amount: string; meal_type: MealType; checked: boolean; note: string; source: string };

type Props = {
  date: string;
  mealType: MealType;
  /** その日のすでに記録済みの合計（「あと○kcal」の表示用） */
  dayTotal: Nutrients;
  targetKcal: number;
  /** マイ食品（音声入力で名前が一致したらこの値を使う） */
  foods: Food[];
  onRecorded: () => void;
  initialOpen?: "voice" | "label" | null;
};

/** 記録画面の上部に出す「🎤 話して記録」「📷 成分表示を撮る」（どちらも端末内で処理・無料） */
export function QuickInput(props: Props) {
  const [open, setOpen] = useState<"voice" | "label" | null>(props.initialOpen ?? null);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setOpen("voice")} className="card flex flex-col items-center gap-1 py-4 active:scale-[0.98]">
          <span className="text-3xl">🎤</span>
          <span className="text-sm font-bold">話して記録</span>
          <span className="text-[11px] text-gray-400">「バナナ1本と卵1個」</span>
        </button>
        <button onClick={() => setOpen("label")} className="card flex flex-col items-center gap-1 py-4 active:scale-[0.98]">
          <span className="text-3xl">📷</span>
          <span className="text-sm font-bold">成分表示を撮る</span>
          <span className="text-[11px] text-gray-400">袋の裏の数字を読み取り</span>
        </button>
      </div>
      <VoiceSheet {...props} open={open === "voice"} onClose={() => setOpen(null)} />
      <LabelSheet {...props} open={open === "label"} onClose={() => setOpen(null)} />
    </>
  );
}

/* ====================== 🎤 話して記録 ====================== */
function VoiceSheet({ open, onClose, date, mealType, dayTotal, targetKcal, foods, onRecorded }: Props & { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [unrecognized, setUnrecognized] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const speech = useSpeech((t) => setText((prev) => (prev ? `${prev}、${t}` : t)));

  useEffect(() => {
    if (!open) {
      speech.stop();
      setText("");
      setDrafts(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function analyze() {
    speech.stop();
    setError(null);
    const { items, unrecognized } = parseFoodText(text, foods);
    if (items.length === 0) {
      setError(
        unrecognized.length > 0
          ? `「${unrecognized.join("」「")}」は辞書にない食品でした。手入力で記録するか、マイ食品に登録すると次から音声で使えます。`
          : "食べ物が見つかりませんでした。「バナナ1本、ゆで卵1個」のように話してみてください。",
      );
      return;
    }
    setUnrecognized(unrecognized);
    setDrafts(items.map((i) => ({ ...i, meal_type: i.meal_type ?? mealType, checked: true })));
  }

  function addBlank() {
    setDrafts((ds) => [...(ds ?? []), { name: "", amount: "", kcal: 0, protein: 0, fat: 0, carbs: 0, meal_type: mealType, checked: true, note: "", source: "unknown" }]);
  }

  const selected = drafts?.filter((d) => d.checked) ?? [];
  const add = sumNutrients(selected);
  const after = dayTotal.kcal + add.kcal;

  async function save() {
    if (selected.length === 0) return;
    if (selected.some((d) => !d.name.trim())) return toast("食品名が空の品目があります");
    setSaving(true);
    const { error } = await createClient()
      .from("meal_entries")
      .insert(
        selected.map((d) => ({
          eaten_on: date,
          meal_type: d.meal_type,
          name: d.name,
          amount: d.amount || null,
          kcal: d.kcal,
          protein: d.protein,
          fat: d.fat,
          carbs: d.carbs,
        })),
      );
    setSaving(false);
    if (error) return toast(`エラー：${error.message}`);
    toast(`${selected.length}品を記録しました`);
    onRecorded();
    onClose();
  }

  const update = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds!.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <Sheet open={open} onClose={onClose} title={drafts ? "これで合っていますか？" : "🎤 話して記録"}>
      {!drafts ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            食べたものを普段どおりに話すか入力してください。数値を言えばその値を使い、マイ食品に登録済みのものはその値、それ以外はよく食べる食品の目安値で計算します。
          </p>
          <textarea
            className="input min-h-32"
            placeholder="例：朝にプロテイン1杯、昼は150キロカロリーのおにぎりとバナナ1本、夜は鶏むね肉150gとゆで卵1個"
            value={speech.interim ? `${text}${text ? "、" : ""}${speech.interim}` : text}
            onChange={(e) => setText(e.target.value)}
          />
          {speech.supported ? (
            <button
              type="button"
              onClick={speech.listening ? speech.stop : speech.start}
              className={`btn w-full py-3 ${speech.listening ? "animate-pulse bg-red-500 text-white" : "bg-brand-50 text-brand-700"}`}
            >
              {speech.listening ? "● 聞き取り中…（タップで停止）" : "🎤 タップして話す"}
            </button>
          ) : (
            <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">キーボードのマイクボタン🎤を押すと、音声で入力できます。</p>
          )}
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          <button onClick={analyze} disabled={!text.trim()} className="btn-primary w-full py-3">
            計算する
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {drafts.map((d, i) => (
              <li key={i} className={`rounded-xl border p-3 ${d.checked ? "border-gray-200" : "border-gray-100 opacity-40"}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-2.5 h-5 w-5 accent-brand-600" checked={d.checked} onChange={(e) => update(i, { checked: e.target.checked })} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input className="input flex-1 py-1.5" value={d.name} onChange={(e) => update(i, { name: e.target.value })} />
                      <input className="input w-24 py-1.5" value={d.amount} placeholder="量" onChange={(e) => update(i, { amount: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["kcal", "protein", "fat", "carbs"] as const).map((k) => (
                        <label key={k} className="block">
                          <span className="block text-center text-[10px] text-gray-400">{k === "kcal" ? "kcal" : k === "protein" ? "P" : k === "fat" ? "F" : "C"}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="input px-1.5 py-1 text-center"
                            value={d[k]}
                            onChange={(e) => update(i, { [k]: Number(e.target.value) } as Partial<Draft>)}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm" value={d.meal_type} onChange={(e) => update(i, { meal_type: e.target.value as MealType })}>
                        {MEAL_TYPES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <SourceBadge source={d.source} />
                    </div>
                    {d.note && <p className="text-[11px] text-gray-500">💡 {d.note}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {unrecognized.length > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              読み取れなかった部分：「{unrecognized.join("」「")}」
              <br />
              下の「品目を追加」から入力できます。マイ食品に登録すると、次から音声で使えます。
            </p>
          )}
          <button onClick={addBlank} className="w-full rounded-xl border-2 border-dashed border-gray-200 py-2 text-sm font-semibold text-gray-500">
            ＋ 品目を追加
          </button>

          <div className="rounded-xl bg-brand-50 p-3 text-center">
            <div className="text-xs text-gray-600">
              合計 <NutrientLine n={add} />
            </div>
            <div className="mt-1 text-sm">
              記録すると {fmt(after, "kcal")} kcal →{" "}
              {after <= targetKcal ? (
                <b className="text-lg text-brand-700">あと {fmt(targetKcal - after, "kcal")} kcal</b>
              ) : (
                <b className="text-lg text-red-600">{fmt(after - targetKcal, "kcal")} kcal オーバー</b>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setDrafts(null)} className="btn-secondary">
              やり直す
            </button>
            <button onClick={save} disabled={saving || selected.length === 0} className="btn-primary flex-1 py-3">
              {saving ? "記録中…" : `${selected.length}品を記録する`}
            </button>
          </div>
          <p className="text-center text-[11px] text-gray-400">「目安」は一般的な値です。気になる数値はタップして直せます。</p>
        </div>
      )}
    </Sheet>
  );
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, [string, string]> = {
    stated: ["言った数値", "bg-blue-50 text-blue-700"],
    my_food: ["マイ食品", "bg-brand-50 text-brand-700"],
    estimate: ["目安", "bg-amber-50 text-amber-700"],
    unknown: ["手入力", "bg-gray-100 text-gray-600"],
  };
  const [label, cls] = map[source] ?? map.estimate;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

/* ====================== 📷 成分表示を撮る ====================== */
function LabelSheet({ open, onClose, date, mealType, dayTotal, targetKcal, onRecorded }: Props & { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ p: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState<LabelResult | null>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState<Nutrients>({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  const [ratio, setRatio] = useState(1);
  const [grams, setGrams] = useState("");
  const [saveAsFood, setSaveAsFood] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setProgress(null);
      setLabel(null);
      setError(null);
      setGrams("");
      setRatio(1);
    }
  }, [open]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    setFile(f);
  }

  async function analyze() {
    if (!file) return;
    setError(null);
    setProgress({ p: 0, status: "準備中" });
    try {
      const label = await recognizeLabel(file, (p, status) => setProgress({ p, status }));
      if (!label.readable) {
        setError("栄養成分表示の数字を読み取れませんでした。枠の部分だけを、明るい場所で正面から近づいて撮り直してください。（下の「数値を手で入れる」から入力もできます）");
        setLabel({ ...label, readable: false });
        return;
      }
      setLabel(label);
      setName("");
      setBase({ kcal: label.kcal, protein: label.protein, fat: label.fat, carbs: label.carbs });
      // 「100gあたり」で内容量がわかるなら、最初は1袋全部を選んでおく
      if (label.basis_grams && label.package_grams && label.package_grams !== label.basis_grams) {
        setRatio(label.package_grams / label.basis_grams);
      } else {
        setRatio(1);
      }
    } catch (e) {
      setError(`読み取りに失敗しました：${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  }

  function manualEntry() {
    const l = label ?? { readable: false, basis_label: "1食あたり", basis_grams: null, package_grams: null, kcal: 0, protein: 0, fat: 0, carbs: 0, missing: [], rawText: "" };
    setLabel({ ...l, readable: true });
    setBase({ kcal: l.kcal, protein: l.protein, fat: l.fat, carbs: l.carbs });
    setRatio(1);
    setError(null);
  }

  const effectiveRatio = grams && label?.basis_grams ? Number(grams) / label.basis_grams : ratio;
  const eaten = scaleNutrients(base, effectiveRatio || 0);
  const after = dayTotal.kcal + eaten.kcal;

  const amountText = (() => {
    if (!label) return "";
    if (grams && label.basis_grams) return `${grams}g`;
    if (label.basis_grams && label.package_grams && Math.abs(ratio - label.package_grams / label.basis_grams) < 1e-6) return `1袋(${label.package_grams}g)`;
    if (ratio === 1) return label.basis_label;
    return `${label.basis_label} ×${round1(ratio)}`;
  })();

  async function save() {
    if (!name.trim()) return toast("商品名を入力してください");
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("meal_entries").insert({ eaten_on: date, meal_type: mealType, name, amount: amountText, ...eaten });
    if (!error && saveAsFood) {
      await supabase.from("foods").insert({ name, unit: amountText || "1食", ...eaten });
    }
    setSaving(false);
    if (error) return toast(`エラー：${error.message}`);
    toast(saveAsFood ? "記録して、マイ食品にも登録しました" : "記録しました");
    onRecorded();
    onClose();
  }

  const ratioOptions: { label: string; ratio: number }[] = label?.readable
    ? [
        ...(label.basis_grams && label.package_grams && label.package_grams !== label.basis_grams
          ? [{ label: `1袋全部 (${label.package_grams}g)`, ratio: label.package_grams / label.basis_grams }]
          : []),
        { label: `${label.basis_label.replace(/あたり$/, "")} ×1`, ratio: 1 },
        { label: "×0.5", ratio: 0.5 },
        { label: "×2", ratio: 2 },
      ].filter((o, i, arr) => arr.findIndex((x) => Math.abs(x.ratio - o.ratio) < 1e-6) === i)
    : [];

  return (
    <Sheet open={open} onClose={onClose} title="📷 成分表示を読み取る">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      {!label?.readable ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            袋や箱の裏の「栄養成分表示」の枠を、文字がはっきり読めるように正面から撮影してください。読み取りはスマホの中で行います（無料）。
          </p>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="撮影した成分表示" className="max-h-72 w-full rounded-xl object-contain" />
          ) : (
            <button onClick={() => fileRef.current?.click()} className="flex h-40 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 text-gray-500">
              <span className="text-4xl">📷</span>
              <span className="mt-1 text-sm font-semibold">タップして撮影 / 写真を選ぶ</span>
            </button>
          )}
          {progress && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round(progress.p * 100)}%` }} />
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">{progress.status}…</p>
            </div>
          )}
          {file && (
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={!!progress} className="btn-secondary">
                撮り直す
              </button>
              <button onClick={analyze} disabled={!!progress} className="btn-primary flex-1 py-3">
                {progress ? "読み取り中…" : "数字を読み取る"}
              </button>
            </div>
          )}
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          {label?.rawText && (
            <details className="text-xs text-gray-500">
              <summary>読み取った文字を見る</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-2">{label.rawText}</pre>
            </details>
          )}
          <button onClick={manualEntry} className="w-full text-center text-sm font-semibold text-brand-600">
            数値を手で入れる
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="label">商品名</span>
            <input className="input" value={name} placeholder="例：うどん（袋麺）" onChange={(e) => setName(e.target.value)} />
          </label>

          <div>
            <span className="label">読み取った値（{label.basis_label}）</span>
            <div className="grid grid-cols-4 gap-1.5">
              {(["kcal", "protein", "fat", "carbs"] as const).map((k) => (
                <label key={k} className="block">
                  <span className="block text-center text-[10px] text-gray-400">{k === "kcal" ? "kcal" : k === "protein" ? "P" : k === "fat" ? "F" : "C"}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input px-1.5 py-1.5 text-center"
                    value={base[k]}
                    onChange={(e) => setBase({ ...base, [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            {label.missing.length > 0 && label.rawText && (
              <p className="mt-1 text-[11px] text-amber-700">⚠ {label.missing.join("・")} が読み取れませんでした。写真を見て入力してください。</p>
            )}
            <p className="mt-1 text-[11px] text-gray-400">写真と見比べて、違っていたら直してください。</p>
            {label.rawText && (
              <details className="mt-1 text-[11px] text-gray-500">
                <summary>読み取った文字を見る</summary>
                <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-2">{label.rawText}</pre>
              </details>
            )}
          </div>

          <div>
            <span className="label">食べた量</span>
            <div className="flex flex-wrap gap-2">
              {ratioOptions.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => {
                    setRatio(o.ratio);
                    setGrams("");
                  }}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold ${
                    !grams && Math.abs(ratio - o.ratio) < 1e-6 ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-100"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {label.basis_grams && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <span className="shrink-0 text-gray-500">グラムで指定</span>
                <input type="number" inputMode="decimal" className="input" placeholder="例：120" value={grams} onChange={(e) => setGrams(e.target.value)} />
                <span className="text-gray-500">g</span>
              </label>
            )}
          </div>

          <div className="rounded-xl bg-brand-50 p-3 text-center">
            <NutrientLine n={eaten} className="text-sm" />
            <div className="mt-1 text-sm">
              記録すると {fmt(after, "kcal")} kcal →{" "}
              {after <= targetKcal ? (
                <b className="text-lg text-brand-700">あと {fmt(targetKcal - after, "kcal")} kcal</b>
              ) : (
                <b className="text-lg text-red-600">{fmt(after - targetKcal, "kcal")} kcal オーバー</b>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={saveAsFood} onChange={(e) => setSaveAsFood(e.target.checked)} />
            マイ食品にも登録する（次からワンタップ・音声でも使える）
          </label>
          <div className="flex gap-2">
            <button onClick={() => setLabel(label.rawText ? { ...label, readable: false } : null)} className="btn-secondary">
              戻る
            </button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1 py-3">
              {saving ? "記録中…" : "記録する"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
