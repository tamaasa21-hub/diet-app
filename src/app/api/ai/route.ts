import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LabelSchema, TextParseSchema } from "@/lib/ai/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

// 使うモデル。環境変数 AI_MODEL で変更できる（例：claude-haiku-5-5 にすると安くなる）
const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
// 1人1日あたりの上限回数
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 30);
// 安全判定で断られたときに自動で別モデルに切り替える機能に対応しているモデル
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"];

const TEXT_SYSTEM = `あなたは日本の管理栄養士です。ユーザーが話した「食べたもの」の文章を、1品ずつに分けて栄養価を出します。

ルール:
- 本人が数値（kcal・P・F・C）を言った品目は、その数値をそのまま使う（source=stated）。kcalだけ言った場合は、その食品として自然なPFCを推定して補い、kcalは言われた値のままにする。
- 「マイ食品」に同じ・ほぼ同じ名前があれば、その値を使い、個数に応じて掛け算する（source=my_food）。
- それ以外は日本食品標準成分表などの一般的な値で推定する（source=estimate）。部位や調理法が不明な場合は一般的なもの（例：鶏肉→鶏むね肉 皮なし、ご飯→白米）を前提にし、noteに書く。
- 数値は小数第1位まで。量の指定がなければ一般的な1人前。
- 文中に「朝」「昼」「夜」「間食・おやつ」などがあれば meal_type に入れる。なければ null。
- 食べ物以外の話（あいさつ、感想など）は無視する。食べ物が1つもなければ items は空配列。`;

const LABEL_SYSTEM = `あなたは食品パッケージの「栄養成分表示」を正確に読み取る係です。
写真に写っている数値をそのまま書き写してください。推測で数値を作らないこと。
- 基準（1袋あたり・100gあたり・1食分あたり など）を basis_label に書く。
- 炭水化物が「糖質」と「食物繊維」に分かれている場合は合計を carbs にする。
- 「たんぱく質」「脂質」「炭水化物」「エネルギー」が読めない場合は readable=false にし、数値は0にする。
- 内容量（例：内容量 200g）が写っていれば package_grams に入れる。`;

type Body =
  | { mode: "text"; text: string }
  | { mode: "label"; image: string; note?: string };

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI機能がまだ設定されていません（ANTHROPIC_API_KEY が未設定）" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  // 入力チェック
  if (body.mode === "text") {
    if (!body.text?.trim() || body.text.length > 2000) {
      return NextResponse.json({ error: "文章が空、または長すぎます（2000文字まで）" }, { status: 400 });
    }
  } else if (body.mode === "label") {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? "");
    if (!m || body.image.length > 4_000_000) {
      return NextResponse.json({ error: "画像が読み込めないか、大きすぎます" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "不明なモードです" }, { status: 400 });
  }

  // 1日の回数制限
  const { data: remaining, error: quotaError } = await supabase.rpc("consume_ai_quota", { p_limit: DAILY_LIMIT });
  if (quotaError) {
    return NextResponse.json({ error: `回数チェックに失敗しました：${quotaError.message}` }, { status: 500 });
  }
  if (remaining === -1) {
    return NextResponse.json({ error: `AIの利用は1日${DAILY_LIMIT}回までです。明日またお試しください。` }, { status: 429 });
  }

  const client = new Anthropic();
  const fallback = FALLBACK_MODELS.includes(MODEL)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};

  try {
    if (body.mode === "text") {
      const { data: foods } = await supabase.from("foods").select("name,unit,kcal,protein,fat,carbs").order("name").limit(100);
      const foodList =
        foods && foods.length > 0
          ? foods.map((f) => `- ${f.name}（${f.unit}）: ${f.kcal}kcal P${f.protein} F${f.fat} C${f.carbs}`).join("\n")
          : "（登録なし）";

      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        ...fallback,
        system: TEXT_SYSTEM,
        output_config: { effort: "low", format: betaZodOutputFormat(TextParseSchema) },
        messages: [
          {
            role: "user",
            content: `【マイ食品】\n${foodList}\n\n【食べたもの】\n${body.text}`,
          },
        ],
      });
      if (response.stop_reason === "refusal") {
        return NextResponse.json({ error: "AIがこの内容を処理できませんでした。言い方を変えてお試しください。" }, { status: 422 });
      }
      if (!response.parsed_output) {
        return NextResponse.json({ error: "AIの返答を読み取れませんでした。もう一度お試しください。" }, { status: 502 });
      }
      return NextResponse.json({ items: response.parsed_output.items, remaining });
    }

    const [, mediaType, data] = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.image)!;
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      ...fallback,
      system: LABEL_SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(LabelSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data } },
            { type: "text", text: body.note?.trim() ? `補足：${body.note.slice(0, 200)}` : "この栄養成分表示を読み取ってください。" },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "AIがこの画像を処理できませんでした。" }, { status: 422 });
    }
    if (!response.parsed_output) {
      return NextResponse.json({ error: "AIの返答を読み取れませんでした。もう一度お試しください。" }, { status: 502 });
    }
    return NextResponse.json({ label: response.parsed_output, remaining });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "AIのAPIキーが正しくありません（管理者に連絡してください）" }, { status: 500 });
    } else if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "AIが混み合っています。少し待ってからお試しください。" }, { status: 429 });
    } else if (error instanceof Anthropic.BadRequestError) {
      const msg = error.message.includes("credit") ? "AIのクレジット残高が不足しています（管理者に連絡してください）" : `AIへのリクエストが不正です：${error.message}`;
      return NextResponse.json({ error: msg }, { status: 500 });
    } else if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AIでエラーが発生しました（${error.status}）。もう一度お試しください。` }, { status: 502 });
    }
    return NextResponse.json({ error: "通信エラーが発生しました。もう一度お試しください。" }, { status: 502 });
  }
}
