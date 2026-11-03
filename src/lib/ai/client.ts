import type { LabelResult, ParsedItem } from "./schemas";

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: "サーバーから正しい応答がありませんでした" }));
  if (!res.ok) throw new Error(json.error ?? `エラー (${res.status})`);
  return json as T;
}

export const parseFoodText = (text: string) => post<{ items: ParsedItem[]; remaining: number }>({ mode: "text", text });
export const readLabel = (image: string, note?: string) => post<{ label: LabelResult; remaining: number }>({ mode: "label", image, note });

/** 写真を長辺 maxSide px の JPEG に縮小して data URL にする（通信量とAI料金を抑える） */
export function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("画像を処理できませんでした"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("この画像は読み込めませんでした（JPEG/PNG の写真を選んでください）"));
    };
    img.src = url;
  });
}
