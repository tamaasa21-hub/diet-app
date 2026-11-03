/**
 * 栄養成分表示の読み取り（端末内の無料OCR：tesseract.js）
 * 写真 → 文字 → 「エネルギー・たんぱく質・脂質・炭水化物」の数値を取り出す
 */

export type LabelResult = {
  readable: boolean;
  basis_label: string;
  basis_grams: number | null;
  package_grams: number | null;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** 見つからなかった項目（確認してもらう） */
  missing: string[];
  rawText: string;
};

/** OCRの数字の読み間違いを補正しつつ、行から最初の数値を取り出す */
function firstNumber(line: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(kcal|g|9|mg)?/i.exec(line);
  if (!m) return null;
  let s = m[1].replace(",", ".");
  // 「5.2g」の g が 9 に化けて「5.29」になることがある → 小数2桁で末尾9かつ単位なしなら9を落とす
  if (!m[2] && /^\d+\.\d9$/.test(s)) s = s.slice(0, -1);
  return Number(s);
}

export function parseLabelText(text: string): LabelResult {
  const cleaned = text
    .normalize("NFKC")
    .replace(/(?<=\d)[oO](?=\d)/g, "0")
    .replace(/(?<=\d)[lI|](?=\d)/g, "1");
  const lines = cleaned
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, ""))
    .filter(Boolean);
  const joined = lines.join("\n");

  // エネルギー
  let kcal: number | null = null;
  const km = /(\d+(?:\.\d+)?)k?ca[l1iI]/i.exec(joined.replace(/\s/g, ""));
  if (km) kcal = Number(km[1]);
  let energyLine = lines.findIndex((l) => /k?ca[l1iI]|エネルギ|ネルギー|熱量/i.test(l));
  if (kcal == null && energyLine >= 0) kcal = firstNumber(lines[energyLine].replace(/^[^\d]*/, ""));
  if (energyLine < 0) energyLine = 0;

  // キーワードで各項目を探す
  const pick = (re: RegExp, exclude?: RegExp) => {
    for (const l of lines) {
      if (re.test(l) && !(exclude && exclude.test(l))) {
        const after = l.replace(re, "§").split("§").pop() ?? "";
        const v = firstNumber(after);
        if (v != null) return v;
      }
    }
    return null;
  };
  let protein = pick(/たん?ぱく質|タンパク質|蛋白質|たん白質|ぱく質|パク質|白質|たんぱく|タンパク/);
  let fat = pick(/脂質|脂/);
  let carbs = pick(/炭水化物|水化物|炭水|化物/);
  const sugar = pick(/糖質/);
  const fiber = pick(/食物繊維|繊維/);
  if (carbs == null && sugar != null) carbs = round1(sugar + (fiber ?? 0));

  // 見つからない項目は、エネルギーの後に並ぶ「〇g」を表示順（P→F→C）で当てはめる
  if (protein == null || fat == null || carbs == null) {
    const gValues: number[] = [];
    for (const l of lines.slice(energyLine + 1)) {
      if (/塩|ナトリ|na|カルシ|鉄|ビタミン/i.test(l)) continue;
      const m = /(\d+(?:\.\d+)?)\s*(g|9)?/.exec(l);
      if (m) gValues.push(firstNumber(m[0])!);
    }
    const order: ("protein" | "fat" | "carbs")[] = ["protein", "fat", "carbs"];
    const cur = { protein, fat, carbs };
    let gi = 0;
    for (const k of order) {
      if (cur[k] == null && gi < gValues.length) cur[k] = gValues[gi];
      gi++;
    }
    ({ protein, fat, carbs } = cur);
  }

  // 基準量（1袋あたり、100gあたり など）
  let basis_label = "表示の基準量";
  let basis_grams: number | null = null;
  const bm = /(100g|100ml|1袋|1食|1個|1本|1枚|1パック|1杯|1缶|1人前|1包装|1カップ|1箱)(?:[(（]?(\d+(?:\.\d+)?)(g|ml)[)）]?)?(?:あたり|当たり|当り)/i.exec(joined.replace(/\n/g, ""));
  if (bm) {
    basis_label = `${bm[1]}${bm[2] ? `(${bm[2]}${bm[3]})` : ""}あたり`;
    basis_grams = /^100(g|ml)$/i.test(bm[1]) ? 100 : bm[2] ? Number(bm[2]) : null;
  }
  const pm = /内容量[:：]?(\d+(?:\.\d+)?)(g|ml)/i.exec(joined.replace(/\n/g, ""));
  const package_grams = pm ? Number(pm[1]) : null;

  const missing: string[] = [];
  if (kcal == null) missing.push("エネルギー");
  if (protein == null) missing.push("たんぱく質");
  if (fat == null) missing.push("脂質");
  if (carbs == null) missing.push("炭水化物");

  return {
    readable: kcal != null && missing.length <= 2,
    basis_label,
    basis_grams,
    package_grams,
    kcal: kcal ?? 0,
    protein: protein ?? 0,
    fat: fat ?? 0,
    carbs: carbs ?? 0,
    missing,
    rawText: text,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** 写真を OCR しやすいように白黒・高コントラストにする */
function preprocess(file: File, maxSide = 2000): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // グレースケール化してコントラストを伸ばす
      let min = 255;
      let max = 0;
      const gray = new Uint8ClampedArray(d.width * d.height);
      for (let i = 0, j = 0; i < d.data.length; i += 4, j++) {
        const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        gray[j] = g;
        if (g < min) min = g;
        if (g > max) max = g;
      }
      const range = Math.max(1, max - min);
      for (let i = 0, j = 0; i < d.data.length; i += 4, j++) {
        const v = ((gray[j] - min) / range) * 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      }
      ctx.putImageData(d, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("この画像は読み込めませんでした（JPEG/PNG の写真を選んでください）"));
    };
    img.src = url;
  });
}

/**
 * 写真から栄養成分表示を読み取る。初回は文字認識のデータ（約5MB）をダウンロードするので少し時間がかかる
 */
export async function recognizeLabel(file: File, onProgress?: (p: number, status: string) => void): Promise<LabelResult> {
  const canvas = await preprocess(file);
  onProgress?.(0, "準備中");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["jpn", "eng"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress, "読み取り中");
      else if (m.status.includes("loading")) onProgress?.(m.progress, "文字認識データを準備中（初回のみ時間がかかります）");
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return parseLabelText(data.text);
  } finally {
    await worker.terminate();
  }
}
