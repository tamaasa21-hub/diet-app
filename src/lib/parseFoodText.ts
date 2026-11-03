/**
 * 「朝にプロテイン1杯、昼は150キロカロリーのおにぎりとバナナ1本、夜は鶏肉150gとゆで卵1個」
 * のような話し言葉を、1品ずつの記録に分ける（AIを使わず端末内で処理）
 */
import { FOOD_DB } from "./foodDb";
import { round1 } from "./nutrition";
import type { Food, MealType, Nutrients } from "./types";

export type ParsedItem = Nutrients & {
  name: string;
  amount: string;
  meal_type: MealType | null;
  /** stated=言った数値 / my_food=マイ食品 / estimate=辞書の目安 / unknown=不明 */
  source: "stated" | "my_food" | "estimate" | "unknown";
  note: string;
};

export type ParseResult = { items: ParsedItem[]; unrecognized: string[] };

/* ---------- 文字の正規化 ---------- */

/** ひらがな→カタカナ（文字数は変わらない） */
function toKata(s: string) {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

const KANJI_DIGITS: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiToNumber(s: string): number {
  let total = 0;
  let current = 0;
  for (const ch of s) {
    if (ch in KANJI_DIGITS) current = current * 10 + KANJI_DIGITS[ch];
    else {
      const unit = ch === "十" ? 10 : ch === "百" ? 100 : 1000;
      total += (current || 1) * unit;
      current = 0;
    }
  }
  return total + current;
}

const UNIT_WORDS = "個|こ|本|杯|はい|枚|切れ|切|パック|缶|袋|玉|丁|膳|皿|人前|粒|食|つ|房|カップ|口|尾|匹|貫|株|束|片|スクープ|g|グラム|ml|ミリ|cc|キロカロリー|カロリー|kcal";

function prepare(raw: string) {
  let t = raw.normalize("NFKC");
  // 漢数字（単位の前だけ）→ 算用数字。例：百五十グラム → 150グラム
  t = t.replace(new RegExp(`([〇零一二三四五六七八九十百千]+)(?=(${UNIT_WORDS}))`, "g"), (m) => String(kanjiToNumber(m)));
  // 数え言葉
  t = t
    .replace(/ひとつ/g, "1つ")
    .replace(/ふたつ/g, "2つ")
    .replace(/みっつ/g, "3つ")
    .replace(/よっつ/g, "4つ")
    .replace(/いっこ/g, "1個");
  // 数字と単位の間の空白を詰める
  t = t.replace(/(\d)\s+(?=\S)/g, "$1");
  return t;
}

/* ---------- 食事区分 ---------- */
const MEAL_PATTERNS: [string, MealType][] = [
  ["朝ごはん", "breakfast"], ["朝ご飯", "breakfast"], ["朝食", "breakfast"], ["朝めし", "breakfast"], ["朝飯", "breakfast"], ["朝", "breakfast"],
  ["昼ごはん", "lunch"], ["昼ご飯", "lunch"], ["昼食", "lunch"], ["昼めし", "lunch"], ["昼飯", "lunch"], ["お昼", "lunch"], ["ランチ", "lunch"], ["昼", "lunch"],
  ["晩ごはん", "dinner"], ["晩ご飯", "dinner"], ["夜ごはん", "dinner"], ["夜ご飯", "dinner"], ["夕ごはん", "dinner"], ["夕ご飯", "dinner"],
  ["夕食", "dinner"], ["夕飯", "dinner"], ["晩飯", "dinner"], ["夜食", "snack"], ["夜", "dinner"], ["晩", "dinner"], ["夕", "dinner"],
  ["間食", "snack"], ["おやつ", "snack"], ["補食", "snack"], ["練習後", "snack"], ["練習前", "snack"],
];
const MEAL_RE = new RegExp(
  MEAL_PATTERNS.map(([p]) => toKata(p))
    .sort((a, b) => b.length - a.length)
    .join("|"),
  "g",
);
const MEAL_MAP = new Map(MEAL_PATTERNS.map(([p, m]) => [toKata(p), m]));

/* ---------- 食品名の候補 ---------- */
type Candidate = { key: string; kind: "my_food"; food: Food } | { key: string; kind: "db"; food: (typeof FOOD_DB)[number] };

function buildCandidates(myFoods: Food[]): Candidate[] {
  const list: Candidate[] = [];
  for (const food of myFoods) {
    const full = toKata(food.name.normalize("NFKC").toLowerCase().replace(/\s/g, ""));
    const base = full.replace(/[(（][^)）]*[)）]/g, "");
    for (const key of new Set([full, base])) if (key.length >= 2) list.push({ key, kind: "my_food", food });
  }
  for (const food of FOOD_DB) {
    for (const a of food.aliases) list.push({ key: toKata(a.normalize("NFKC").toLowerCase()), kind: "db", food });
  }
  // 長い名前を優先。同じ長さならマイ食品を優先
  return list.sort((a, b) => b.key.length - a.key.length || (a.kind === "my_food" ? -1 : 1));
}

/* ---------- 量の表現 ---------- */
type Qty = { start: number; end: number; kcal?: number; grams?: number; count?: number; unitWord?: string; mult?: number; p?: number; f?: number; c?: number };

const NUM = "(\\d+(?:\\.\\d+)?)";
const QTY_RES: { re: RegExp; make: (m: RegExpExecArray) => Partial<Qty> }[] = [
  { re: new RegExp(`${NUM}(?:kcal|キロカロリー|キロカロ|カロリー)`, "g"), make: (m) => ({ kcal: Number(m[1]) }) },
  { re: new RegExp(`(?:タンパク質|タンパク|蛋白質|(?<![a-z])p)${NUM}(?:g|グラム)?`, "g"), make: (m) => ({ p: Number(m[1]) }) },
  { re: new RegExp(`(?:脂質|(?<![a-z])f)${NUM}(?:g|グラム)?`, "g"), make: (m) => ({ f: Number(m[1]) }) },
  { re: new RegExp(`(?:炭水化物|炭水|糖質|(?<![a-z])c)${NUM}(?:g|グラム)?`, "g"), make: (m) => ({ c: Number(m[1]) }) },
  { re: new RegExp(`${NUM}(?:g|グラム|ml|ミリリットル|ミリ|cc)(?![a-z])`, "g"), make: (m) => ({ grams: Number(m[1]) }) },
  { re: /(\d+)\/(\d+)(個|本|杯|枚|切レ|切|パック|缶|袋|玉|丁|膳|皿|人前|粒|食|ツ|房|カップ)?/g, make: (m) => ({ count: Number(m[1]) / Number(m[2]), unitWord: m[3] }) },
  {
    re: new RegExp(`(\\d+(?:\\.\\d+)?|半)(個|コ|本|杯|ハイ|枚|切レ|切|パック|缶|袋|玉|丁|膳|皿|人前|粒|食|ツ|房|カップ|口|尾|匹|貫|株|束|片|スクープ)(半)?`, "g"),
    make: (m) => ({ count: (m[1] === "半" ? 0.5 : Number(m[1])) + (m[3] ? 0.5 : 0), unitWord: m[2] === "コ" ? "個" : m[2] === "ツ" ? "つ" : m[2].replace("切レ", "切れ") }),
  },
  { re: /大盛リ|大盛/g, make: () => ({ mult: 1.5 }) },
  { re: /特盛リ|特盛/g, make: () => ({ mult: 2 }) },
  { re: /小盛リ|小盛/g, make: () => ({ mult: 0.7 }) },
  { re: /半分|ハンブン/g, make: () => ({ mult: 0.5 }) },
];

function findQuantities(s: string, offset: number): Qty[] {
  const found: Qty[] = [];
  const taken: [number, number][] = [];
  for (const { re, make } of QTY_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      found.push({ start: start + offset, end: end + offset, ...make(m) });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

const FILLER = ["食ベマシタ", "食ベタ", "食ベテ", "タベテ", "飲ンデ", "コレ", "ソレ", "アレ", "タベタ", "食ッタ", "飲ミマシタ", "飲ンダ", "ノンダ", "今日ハ", "今日", "キョウハ", "キョウ", "アト", "ソレカラ", "ソレト", "ソシテ", "デス", "マシタ", "クライ", "グライ", "クラウイ", "クライ", "クライ", "ダケ", "ヲ", "ハ", "ニ", "ト", "ノ", "モ", "ガ", "デ", "ヤ", "□"];

/* ---------- 本体 ---------- */
export function parseFoodText(raw: string, myFoods: Food[]): ParseResult {
  const orig = prepare(raw);
  let norm = toKata(orig.toLowerCase());
  if (norm.length !== orig.length) norm = toKata(orig); // 念のため（長さがずれる特殊文字対策）

  // 食事区分の言葉の位置を記録して、食品名と誤認しないよう □ で隠す
  const mealMarks: { pos: number; meal: MealType }[] = [];
  norm = norm.replace(MEAL_RE, (m, pos: number) => {
    mealMarks.push({ pos, meal: MEAL_MAP.get(m)! });
    return "□".repeat(m.length);
  });

  // 区切り（読点・改行・空白・「あと」「それから」など）で分割
  const segments: { start: number; end: number }[] = [];
  const sepRe = /[、。,.!?！？\n\s]+|アト|ソレカラ|ソレト|ソシテ|ソレニ/g;
  let last = 0;
  let sm: RegExpExecArray | null;
  while ((sm = sepRe.exec(norm))) {
    if (sm.index > last) segments.push({ start: last, end: sm.index });
    last = sm.index + sm[0].length;
    if (sm[0].length === 0) sepRe.lastIndex++;
  }
  if (last < norm.length) segments.push({ start: last, end: norm.length });

  const candidates = buildCandidates(myFoods);
  const items: ParsedItem[] = [];
  const unrecognized: string[] = [];
  let currentMeal: MealType | null = null;

  for (const seg of segments) {
    const marks = mealMarks.filter((mm) => mm.pos >= seg.start && mm.pos < seg.end);
    if (marks.length > 0) currentMeal = marks[0].meal;
    const text = norm.slice(seg.start, seg.end);

    // 食品名を左から最長一致で探す
    const matches: { start: number; end: number; cand: Candidate }[] = [];
    for (let i = 0; i < text.length; ) {
      const cand = candidates.find((c) => text.startsWith(c.key, i));
      if (cand) {
        matches.push({ start: seg.start + i, end: seg.start + i + cand.key.length, cand });
        i += cand.key.length;
      } else i++;
    }

    const quantities = findQuantities(text, seg.start);
    // 量がどの食品のものか決める：「150gの鶏肉」のように後ろに「の」があれば次の食品、なければ直前の食品
    const assigned: Qty[][] = matches.map(() => []);
    const orphanKcal: Qty[] = [];
    const orphanPfc: Qty[] = [];
    for (const q of quantities) {
      if (matches.length === 0) {
        if (q.kcal != null) orphanKcal.push(q);
        else if (q.p != null || q.f != null || q.c != null) orphanPfc.push(q);
        continue;
      }
      const followedByNo = norm[q.end] === "ノ";
      const nextIdx = matches.findIndex((m) => m.start >= q.end);
      const prevIdx = matches.map((m, i) => (m.end <= q.start ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
      let target = followedByNo && nextIdx >= 0 ? nextIdx : prevIdx >= 0 ? prevIdx : nextIdx;
      if (target < 0) target = 0;
      assigned[target].push(q);
    }

    matches.forEach((m, i) => items.push(buildItem(m.cand, assigned[i], orig, currentMeal)));

    // 「たんぱく質24g」だけの部分 → 直前の品目に反映
    if (orphanKcal.length === 0 && orphanPfc.length > 0 && items.length > 0) {
      const prev = items[items.length - 1];
      for (const q of orphanPfc) {
        if (q.p != null) prev.protein = q.p;
        if (q.f != null) prev.fat = q.f;
        if (q.c != null) prev.carbs = q.c;
      }
      prev.source = "stated";
    }

    // 食品名が見つからないが kcal を言っている → 名前不明の品目として追加
    for (const q of orphanKcal) {
      const after = orig.slice(q.end, seg.end).replace(/^の/, "");
      const guess = after.replace(/(を)?(食べ|飲ん|たべ|のん).*$/, "").slice(0, 20);
      const name = !guess || /^(これ|それ|あれ|やつ|もの)$/.test(guess) ? "食品" : guess;
      items.push({
        name, amount: "", kcal: q.kcal!, protein: q.p ?? 0, fat: q.f ?? 0, carbs: q.c ?? 0,
        meal_type: currentMeal, source: "stated", note: "PFCがわかれば入力してください",
      });
    }

    // 何も読み取れなかった部分
    if (matches.length === 0 && orphanKcal.length === 0 && orphanPfc.length === 0) {
      let rest = text;
      for (const q of quantities) rest = rest.replace(norm.slice(q.start, q.end), "");
      for (const w of FILLER) rest = rest.split(w).join("");
      if (rest.replace(/[\d\s]/g, "").length >= 2) unrecognized.push(orig.slice(seg.start, seg.end));
    }
  }

  return { items, unrecognized };
}

function buildItem(cand: Candidate, qs: Qty[], orig: string, meal: MealType | null): ParsedItem {
  const food = cand.food;
  const base: Nutrients = { kcal: Number(food.kcal), protein: Number(food.protein), fat: Number(food.fat), carbs: Number(food.carbs) };
  const unit = cand.food.unit;
  const unitGrams = cand.kind === "db" ? cand.food.grams : gramsFromUnit(cand.food.unit);

  const kcalQ = qs.find((q) => q.kcal != null)?.kcal;
  const grams = qs.find((q) => q.grams != null)?.grams;
  const countQ = qs.find((q) => q.count != null);
  const mult = qs.reduce((acc, q) => acc * (q.mult ?? 1), 1);
  const pQ = qs.find((q) => q.p != null)?.p;
  const fQ = qs.find((q) => q.f != null)?.f;
  const cQ = qs.find((q) => q.c != null)?.c;

  let ratio = 1;
  let amount = unit;
  const notes: string[] = [];
  if (grams != null && unitGrams) {
    ratio = grams / unitGrams;
    amount = `${grams}g`;
  } else if (countQ) {
    ratio = countQ.count! / unitCount(unit, countQ.unitWord);
    amount = `${round1(countQ.count!)}${countQ.unitWord ?? ""}`;
    if (grams != null && !unitGrams) notes.push(`${grams}gの指定は換算できないため個数で計算`);
  } else if (grams != null && !unitGrams) {
    notes.push(`「${unit}」あたりの値で計算（g換算できません）`);
  }
  if (mult !== 1) {
    ratio *= mult;
    amount = mult === 0.5 ? `${amount} 半分` : mult === 1.5 ? `${amount} 大盛り` : mult === 2 ? `${amount} 特盛り` : `${amount} 小盛り`;
  }

  let n: Nutrients = {
    kcal: round1(base.kcal * ratio),
    protein: round1(base.protein * ratio),
    fat: round1(base.fat * ratio),
    carbs: round1(base.carbs * ratio),
  };
  let source: ParsedItem["source"] = cand.kind === "my_food" ? "my_food" : "estimate";

  if (kcalQ != null) {
    // カロリーを言った場合はその値を使い、PFCは同じ食品の比率で按分
    const k = base.kcal > 0 ? kcalQ / base.kcal : 0;
    n = { kcal: kcalQ, protein: round1(base.protein * k), fat: round1(base.fat * k), carbs: round1(base.carbs * k) };
    source = "stated";
    notes.push(`PFCは「${food.name}」の比率から計算`);
    if (!countQ && grams == null) amount = "";
  }
  if (pQ != null) n.protein = pQ;
  if (fQ != null) n.fat = fQ;
  if (cQ != null) n.carbs = cQ;
  if (pQ != null || fQ != null || cQ != null) source = "stated";

  if (cand.kind === "db" && cand.food.note && source !== "stated") notes.push(cand.food.note);

  return { name: food.name, amount, ...n, meal_type: meal, source, note: notes.join("・") };
}

/** 単位の中の個数。例：「10粒(12g)」で「粒」なら10、「1/2丁(150g)」で「丁」なら0.5 */
function unitCount(unit: string, word?: string): number {
  if (!word) return 1;
  const m = new RegExp(`(\\d+(?:\\.\\d+)?)(?:/(\\d+))?${word}`).exec(unit.normalize("NFKC"));
  if (!m) return 1;
  const v = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
  return v > 0 ? v : 1;
}

function gramsFromUnit(unit: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(g|ml|グラム)/i.exec(unit.normalize("NFKC"));
  return m ? Number(m[1]) : null;
}
