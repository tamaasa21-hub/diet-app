import { z } from "zod";

/** 音声・文章から読み取った1品 */
export const ParsedItemSchema = z.object({
  name: z.string().describe("食品名（例：バナナ、ゆで卵、鶏むね肉（皮なし））"),
  amount: z.string().describe("量（例：1本、1個、150g）。不明なら空文字"),
  kcal: z.number(),
  protein: z.number().describe("タンパク質 g"),
  fat: z.number().describe("脂質 g"),
  carbs: z.number().describe("炭水化物 g"),
  meal_type: z
    .enum(["breakfast", "lunch", "dinner", "snack"])
    .nullable()
    .describe("文中で朝・昼・夜・間食が明示されていればその区分、なければ null"),
  source: z
    .enum(["stated", "my_food", "estimate"])
    .describe("stated=本人が数値を言った / my_food=マイ食品の値を使った / estimate=一般的な値で推定"),
  note: z.string().describe("前提にしたこと（例：皮なしで計算）。なければ空文字"),
});
export const TextParseSchema = z.object({ items: z.array(ParsedItemSchema) });
export type ParsedItem = z.infer<typeof ParsedItemSchema>;

/** 栄養成分表示の読み取り結果 */
export const LabelSchema = z.object({
  readable: z.boolean().describe("栄養成分表示が読み取れたか"),
  product_name: z.string().describe("商品名（写っていれば）。不明なら空文字"),
  basis_label: z.string().describe("表示の基準（例：1袋(200g)あたり、100gあたり、1食分あたり）"),
  basis_grams: z.number().nullable().describe("基準の重さ g（例：100gあたりなら100、1袋(200g)あたりなら200）。不明なら null"),
  package_grams: z.number().nullable().describe("内容量 g（写っていれば）。不明なら null"),
  kcal: z.number().describe("基準量あたりのエネルギー kcal"),
  protein: z.number().describe("基準量あたりのたんぱく質 g"),
  fat: z.number().describe("基準量あたりの脂質 g"),
  carbs: z.number().describe("基準量あたりの炭水化物 g。糖質と食物繊維が別記なら合計"),
  note: z.string().describe("読み取りで迷った点など。なければ空文字"),
});
export type LabelResult = z.infer<typeof LabelSchema>;
