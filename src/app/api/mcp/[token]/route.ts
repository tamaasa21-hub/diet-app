/**
 * Claude 連携用の MCP サーバー（Streamable HTTP・ステートレス）
 * URL: /api/mcp/<連携キー>
 * Claude の「カスタムコネクタ」に登録すると、チャットからもぐログの記録を読み書きできる。
 * データの読み書きはすべて Supabase の mcp_* 関数経由で、連携キーの持ち主のデータだけに限られる。
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const MEAL = { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "breakfast=朝食, lunch=昼食, dinner=夕食, snack=間食" };
const DATE = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "日付 YYYY-MM-DD（省略時は日本時間の今日）" };
const NUM = (d: string) => ({ type: "number", minimum: 0, description: d });

const INSTRUCTIONS = `もぐログは、ユーザーの食事・体重を記録する食事記録アプリです。
- ユーザーが食べたものを伝えたら：まず list_my_foods で登録済みの食品を確認し、同じものはその値（個数に応じて掛け算）を使う。それ以外は日本食品標準成分表などの一般的な値で kcal・タンパク質・脂質・炭水化物を推定する。ユーザーが数値を言った場合はその値を優先する。
- 食事区分（朝・昼・夜・間食）がわからなければ、話の内容や時刻から判断する。記録したら、その日の残り（kcal・P・F）を短く伝える。
- 推定した値は「目安」であることを一言添える。記録を間違えたときは get_day で id を確認して delete_meal_entry で消す。
- 振り返りを頼まれたら get_summary で期間のデータを読み、目標との差や傾向を具体的に伝える。医療的な判断はしない。`;

const TOOLS = [
  {
    name: "get_day",
    title: "その日の状況を見る",
    description: "指定日（省略時は今日）の目標・合計・残り（kcal/P/F/C）・記録一覧（id付き）・最新の体重・目標体重を返す。",
    inputSchema: { type: "object", properties: { date: DATE }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "log_meals",
    title: "食事を記録する",
    description: "食べたものを1件以上まとめて記録し、記録後のその日の合計と残りを返す。数値はその量を食べたときの値（1単位あたりではない）。",
    inputSchema: {
      type: "object",
      properties: {
        date: DATE,
        entries: {
          type: "array",
          minItems: 1,
          maxItems: 30,
          items: {
            type: "object",
            properties: {
              meal_type: MEAL,
              name: { type: "string", description: "食品名（例：親子丼 大盛り）" },
              amount: { type: "string", description: "量（例：1杯、150g）" },
              kcal: NUM("カロリー kcal"),
              protein: NUM("タンパク質 g"),
              fat: NUM("脂質 g"),
              carbs: NUM("炭水化物 g"),
            },
            required: ["meal_type", "name", "kcal", "protein", "fat", "carbs"],
            additionalProperties: false,
          },
        },
      },
      required: ["entries"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "delete_meal_entry",
    title: "記録を削除する",
    description: "get_day で確認した id の記録を1件削除する。",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "記録の id" } }, required: ["id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: "get_summary",
    title: "期間の集計を見る",
    description: "期間（最大120日）の日ごとの合計（kcal/P/F/C）と体重の記録、目標値を返す。振り返りに使う。",
    inputSchema: {
      type: "object",
      properties: { from: { ...DATE, description: "開始日 YYYY-MM-DD" }, to: { ...DATE, description: "終了日 YYYY-MM-DD（省略時は今日）" } },
      required: ["from"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "log_weight",
    title: "体重を記録する",
    description: "体重を記録する（同じ日の記録は上書き）。",
    inputSchema: {
      type: "object",
      properties: { date: DATE, weight_kg: { type: "number", minimum: 20, maximum: 300, description: "体重 kg" } },
      required: ["weight_kg"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "list_my_foods",
    title: "マイ食品を見る",
    description: "ユーザーが登録した「マイ食品」（よく食べるものと1単位あたりの栄養）の一覧を返す。食事を記録する前に確認する。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "add_my_food",
    title: "マイ食品に登録する",
    description: "よく食べる食品を「マイ食品」に登録する（数値は unit 1つあたり）。ユーザーが登録を望んだときに使う。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        unit: { type: "string", description: "単位（例：1杯、1個、100g）" },
        kcal: NUM("kcal"),
        protein: NUM("タンパク質 g"),
        fat: NUM("脂質 g"),
        carbs: NUM("炭水化物 g"),
      },
      required: ["name", "unit", "kcal", "protein", "fat", "carbs"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

function todayJST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDaysStr(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

async function callTool(token: string, name: string, args: Record<string, unknown>) {
  const date = isDate(args.date) ? args.date : todayJST();
  switch (name) {
    case "get_day":
      return rpc("mcp_get_day", { p_token: token, p_date: date });
    case "log_meals":
      return rpc("mcp_add_entries", { p_token: token, p_date: date, p_entries: args.entries });
    case "delete_meal_entry":
      return rpc("mcp_delete_entry", { p_token: token, p_id: args.id });
    case "get_summary": {
      const to = isDate(args.to) ? args.to : todayJST();
      const from = isDate(args.from) ? args.from : addDaysStr(to, -6);
      return rpc("mcp_get_range", { p_token: token, p_from: from, p_to: to });
    }
    case "log_weight":
      return rpc("mcp_log_weight", { p_token: token, p_date: date, p_weight: args.weight_kg });
    case "list_my_foods":
      return rpc("mcp_list_foods", { p_token: token });
    case "add_my_food":
      return rpc("mcp_add_food", { p_token: token, p_food: args });
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

async function handle(token: string, req: JsonRpcRequest) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: req.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: req.id ?? null, error: { code, message } });

  switch (req.method) {
    case "initialize": {
      const requested = String(req.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mogulog", title: "もぐログ", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const data = await callTool(token, name, args);
        return ok({ content: [{ type: "text", text: JSON.stringify(data) }], isError: false });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `エラー: ${(e as Error).message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${req.method}`);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const messages = Array.isArray(body) ? body : [body];
  // 接続時にキーが有効か確認（無効なら 404 で接続させない）
  if (messages.some((m) => m.method === "initialize")) {
    try {
      await rpc("mcp_list_foods", { p_token: token });
    } catch {
      return NextResponse.json({ error: "invalid connector key" }, { status: 404 });
    }
  }

  const responses = [];
  for (const m of messages) {
    if (m.id === undefined || m.id === null) continue; // 通知には返事しない
    responses.push(await handle(token, m));
  }
  if (responses.length === 0) return new Response(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? responses : responses[0]);
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
