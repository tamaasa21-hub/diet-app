"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "./ui";

type TokenInfo = { created_at: string; last_used_at: string | null } | null;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 設定画面：Claude 連携（連携キーの発行・作り直し・無効化） */
export function ClaudeConnect() {
  const toast = useToast();
  const [info, setInfo] = useState<TokenInfo | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("connector_tokens").select("created_at,last_used_at").maybeSingle();
    if (error) {
      setError(error.message.includes("connector_tokens") ? "準備ができていません：管理者が SQL（004_claude_connector.sql）を実行する必要があります" : error.message);
      setInfo(null);
      return;
    }
    setInfo(data as TokenInfo);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function issue() {
    if (info && !confirm("連携キーを作り直しますか？\n今 Claude に登録しているURLは使えなくなるので、新しいURLで登録し直してください。")) return;
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("create_connector_token");
    setBusy(false);
    if (error) return setError(error.message);
    setUrl(`${window.location.origin}/api/mcp/${data as string}`);
    load();
  }

  async function revoke() {
    if (!confirm("Claude 連携を無効にしますか？\n登録しているURLは使えなくなります（記録は消えません）。")) return;
    setBusy(true);
    await createClient().rpc("delete_connector_token");
    setBusy(false);
    setUrl(null);
    toast("Claude 連携を無効にしました");
    load();
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("URLをコピーしました");
    } catch {
      toast("コピーできませんでした。長押しで選択してコピーしてください");
    }
  }

  return (
    <section className="card">
      <h2 className="font-bold">🤖 Claude 連携</h2>
      <p className="mt-1 text-xs text-gray-500">
        Claude のチャットで「昼に親子丼とプロテイン食べた」と話すだけで、もぐログに記録できます。「今週の食事どうだった？」と振り返りも頼めます。追加料金はかかりません（Claude の有料プランが必要）。
      </p>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {url ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border-2 border-brand-100 bg-brand-50 p-3">
            <p className="text-xs font-semibold text-brand-700">あなた専用の連携URL（この画面を閉じると二度と表示されません）</p>
            <p className="mt-1 break-all font-mono text-xs select-all">{url}</p>
            <button onClick={copy} className="btn-primary mt-2 w-full text-sm">
              URLをコピー
            </button>
          </div>
          <Steps />
          <p className="text-[11px] text-red-600">⚠ このURLを知っている人は、あなたの記録を読み書きできます。人に送ったり、SNSに貼ったりしないでください。</p>
        </div>
      ) : info ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            ✅ 連携中<span className="ml-2 text-xs text-gray-500">発行 {fmt(info.created_at)}{info.last_used_at ? ` ・ 最後に使用 ${fmt(info.last_used_at)}` : " ・ まだ使われていません"}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={issue} disabled={busy} className="btn-secondary text-sm">
              URLを作り直す
            </button>
            <button onClick={revoke} disabled={busy} className="btn-danger text-sm">
              連携を無効にする
            </button>
          </div>
          <p className="text-[11px] text-gray-400">URLは安全のため保存していません。わからなくなったら「作り直す」で新しいURLを発行し、Claude に登録し直してください。</p>
        </div>
      ) : info === null && !error ? (
        <button onClick={issue} disabled={busy} className="btn-primary mt-3 w-full">
          {busy ? "発行中…" : "連携URLを発行する"}
        </button>
      ) : null}
    </section>
  );
}

function Steps() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-gray-700">
      <li>
        <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline">
          claude.ai の「設定 → コネクタ」
        </a>
        を開く
      </li>
      <li>「カスタムコネクタを追加」を押す</li>
      <li>名前に「もぐログ」、URLにコピーしたURLを貼り付けて「追加」</li>
      <li>チャット画面の「＋」→ コネクタで「もぐログ」がオンになっていることを確認</li>
      <li>「今日の昼、親子丼とプロテイン食べた」と話しかけてみる</li>
    </ol>
  );
}
