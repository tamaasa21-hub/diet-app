# もぐログ 🍚 — 食事記録Webアプリ

スマホのブラウザで使える食事記録アプリです。1日の目標に対して「あとどれくらい食べられるか」が常に表示されます。
複数人で使えて、データは人ごとに完全に分かれます（Supabase の Row Level Security）。

- **技術**: Next.js 15 (App Router) / Supabase（認証・DB） / Tailwind CSS / Recharts / PWA
- **公開**: GitHub → Vercel（すべて無料プランで動きます）

---

## 機能

| 画面 | できること |
|---|---|
| ホーム | 今日の合計と残り（kcal・P・F・C）を大きく表示。食事区分ごとの一覧、タップで編集・削除。前の日にも切り替え可 |
| 🎤 話して記録 | 「朝にプロテイン1杯、昼は150kcalのおにぎりとバナナ1本、夜は鶏肉150g」のように話すと、品目ごとに分けてkcal・PFCを計算（端末内で処理・無料）。言った数値はそのまま、マイ食品はその値、それ以外は内蔵の食品辞書（約90品目の目安値）を使う。確認画面で直してまとめて記録、「あと○kcal」も表示 |
| 📷 成分表示を撮る | 袋の裏の栄養成分表示を撮影すると、端末内の文字認識（tesseract.js・無料）で数値を読み取り。「1袋全部」「g指定」など食べた量を選んで記録、マイ食品にも登録できる。初回のみ文字認識データ（約5MB）をダウンロード |
| 記録（＋ボタン） | ①マイ食品をワンタップ追加（「量」で×0.5〜×3） ②自作料理を「1/4食べた」など割合で記録 ③手入力（マイ食品にも同時登録可） ④最近食べたものから再追加 |
| マイ食品 | よく食べる食品の登録・編集（例：プロテイン1杯 118kcal / P21 / F1.5） |
| 自作料理 | 材料を入れると合計を自動計算。材料はマイ食品から選ぶことも可 |
| 集計 | 日（PFCバランス・食事別）／週／月（kcal・P・F の棒グラフ＋目標ライン、平均、達成日数、表） |
| 体重 | 記録と推移グラフ（1か月・3か月・1年） |
| 設定 | 身体情報・目標値の変更（提案値の再計算）、パスワード変更、ログアウト、データの書き出し（CSV）、アカウント削除 |
| プライバシー（`/privacy`） | ログインなしで見られる説明ページ。友達に紹介するときはこのURLを送ればOK |

### 目標値の提案ロジック（`src/lib/nutrition.ts`）
- 基礎代謝：Mifflin-St Jeor 式 → × 運動量の係数 = 1日の消費カロリー
- 目的：減量 ×0.8 ／ 維持 ×1.0 ／ 増量 ×1.1
- タンパク質：体重 × 2.0g（減量）／1.6g（維持）／1.8g（増量）
- 脂質：カロリーの25%（「ローファット」を選ぶと15%）
- 炭水化物：残りのカロリー

例）171cm・70kg・20歳・男性・「活発」・減量・ローファット → **約2,310kcal / P140g / F39g**。
提案値はあくまで目安なので、設定画面で自由に書き換えられます（例：2,100kcal / P130g / F40g）。

---

## セットアップ手順（はじめての人向け）

全体の流れ：**① GitHub にコードを置く → ② Supabase でデータベースを作る → ③ Vercel で公開 → ④ ログイン設定の仕上げ → ⑤ スマホのホーム画面に追加**

所要時間は 30〜60 分ほどです。Google ログインが不要なら ④-3 は飛ばしてOKです。

### ① GitHub にコードを置く

1. https://github.com でアカウントを作成（持っていれば不要）
2. 右上の「＋」→ **New repository**
3. Repository name に `meal-log` と入力、**Private** を選択 →（README などのチェックは付けずに）**Create repository**
4. このフォルダのコードをそのリポジトリに push します（Claude に「GitHub の `ユーザー名/meal-log` に push して」と頼めば代わりに行えます）

### ② Supabase でデータベースを作る

1. https://supabase.com →「Start your project」→ GitHub アカウントでサインイン
2. **New project** をクリック
   - Name: `meal-log`
   - Database Password: 「Generate a password」で作り、メモ帳などに保存
   - Region: **Northeast Asia (Tokyo)**
   - Plan: Free
   - 「Create new project」→ 1〜2分待つ
3. 左メニューの **SQL Editor** を開く →「New query」
4. このリポジトリの [`supabase/schema.sql`](supabase/schema.sql) の中身を **全部コピーして貼り付け** →右下の **Run**
   - 「Success. No rows returned」と出ればOK
   - 左メニュー **Table Editor** に `profiles`, `meal_entries`, `foods`, `recipes`, `recipe_ingredients`, `weight_logs` が並び、それぞれに RLS が有効になっていることを確認
5. 接続情報をメモします
   - 画面上部の **Connect** ボタン、または **Project Settings → Data API** で **Project URL**（`https://xxxx.supabase.co`）
   - **Project Settings → API Keys** で **Publishable key**（`sb_publishable_...`）
     - 古い表示の場合は「anon public」キー（`eyJ...` で始まる長い文字列）でも動きます
   - ⚠️ **secret key / service_role key は絶対に使わない・公開しない**でください

### ③ Vercel で公開する

1. https://vercel.com →「Sign Up」→ **Continue with GitHub**（Hobby プラン＝無料）
2. **Add New… → Project** → ①で作った `meal-log` の **Import**
3. 「Environment Variables」を開いて、次の2つを追加

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ②-5 の Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ②-5 の Publishable key |

4. **Deploy** → 1〜2分で完了。表示された URL（例：`https://meal-log-xxxx.vercel.app`）をメモ

> 以後は GitHub に push するたびに、Vercel が自動で更新してくれます。

### ④ ログイン設定の仕上げ（Supabase）

#### ④-1 戻り先URLの設定（必須）
Supabase の **Authentication → URL Configuration**
- **Site URL**：③の URL（例：`https://meal-log-xxxx.vercel.app`）
- **Redirect URLs** に「Add URL」で次を追加
  - `https://meal-log-xxxx.vercel.app/**`
  - `http://localhost:3000/**`（自分のPCで動かす場合）

#### ④-1.5 アカウント削除機能を有効にする
SQL Editor で [`supabase/002_delete_account.sql`](supabase/002_delete_account.sql) を実行します（`schema.sql` を最新版で実行した場合は不要）。

#### ④-2 メール確認について（重要）
無料プランの標準メール送信は **1時間あたり数通まで** と非常に少なく、部活の仲間が一斉に登録すると確認メールが届かなくなります。どちらかを選んでください。

- **かんたん**：**Authentication → Sign In / Providers → Email** の **Confirm email** をオフにする
  → 確認メールなしで、登録してすぐ使えます（仲間内で使うならこれで十分）
- **きちんと**：**Authentication → Emails → SMTP Settings** で外部メールサービス（Resend など無料枠あり）を設定する

#### ④-3 Googleログイン（使う場合のみ）
1. https://console.cloud.google.com を開き、上部のプロジェクト選択 →「新しいプロジェクト」→ 名前 `meal-log` で作成
2. 左メニュー「API とサービス」→ **OAuth 同意画面**（Google Auth Platform）→「開始」
   - アプリ名：`もぐログ`、ユーザーサポートメール：自分のメール
   - 対象：**外部**
   - 連絡先メール：自分のメール → 作成
3. **対象（Audience）** で「アプリを公開」→ 本番環境に公開（これをしないと自分以外がログインできません。基本的な情報しか使わないので審査は不要です）
4. **クライアント** →「クライアントを作成」
   - アプリケーションの種類：**ウェブ アプリケーション**
   - 承認済みのリダイレクト URI：`https://xxxx.supabase.co/auth/v1/callback`（xxxx は自分の Project URL）
     - Supabase の **Authentication → Sign In / Providers → Google** 画面に表示される「Callback URL」をコピーするのが確実です
   - 作成すると **クライアントID** と **クライアントシークレット** が表示されるのでコピー
5. Supabase の **Authentication → Sign In / Providers → Google** を開き、**Enable** をオン → クライアントID・シークレットを貼り付けて **Save**

### ⑤ スマホのホーム画面に追加（PWA）
- **iPhone（Safari）**：URL を開く → 下の共有ボタン（□↑）→「ホーム画面に追加」
- **Android（Chrome）**：URL を開く → 右上の︙ →「ホーム画面に追加」または「アプリをインストール」

アプリのようにフル画面で起動します。仲間には URL を送って、各自で新規登録してもらいましょう。

---

## 自分のPCで動かす（任意・開発する人向け）

Node.js 20 以上が必要です。

```bash
npm install
```

```bash
cp .env.local.example .env.local
```

`.env.local` を開いて Supabase の URL とキーを書き込んでから：

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

---

## 無料プランでの注意点

- **Supabase Free**：DB 500MB（テキスト中心なので数十人で何年も使える容量）。**1週間アクセスがないとプロジェクトが一時停止**します。ダッシュボードから「Restore」で再開できます（データは消えません）
- **Vercel Hobby**：個人・非商用の利用が条件です
- メール送信数の制限は ④-2 を参照

## フォルダ構成

```
supabase/schema.sql        … テーブル定義と RLS（SQL Editor で実行）
src/middleware.ts          … 未ログインなら /login へ
src/app/login              … ログイン・新規登録
src/app/onboarding         … 初回の身体情報入力と目標提案
src/app/(app)/page.tsx     … ホーム
src/app/(app)/add          … 食事の記録
src/app/(app)/foods        … マイ食品
src/app/(app)/recipes      … 自作料理
src/app/(app)/stats        … 集計グラフ
src/app/(app)/weight       … 体重
src/app/(app)/settings     … 設定
src/lib/nutrition.ts       … 目標値の計算
src/lib/foodDb.ts          … 音声入力用の食品辞書（ここに追加すると認識できる食品が増える）
src/lib/parseFoodText.ts   … 話した文章を品目に分ける処理
src/lib/labelOcr.ts        … 栄養成分表示の読み取り
public/sw.js               … Service Worker（PWA）
```

## セキュリティ（データの分離）
- すべてのテーブルで RLS を有効にし、「`auth.uid()` が自分の行だけ読み書き可」というポリシーを設定しています
- アプリに埋め込むのは公開用の Publishable key だけなので、キーが見られても他人のデータにはアクセスできません
