"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("deleted")) {
      setMessage({ type: "info", text: "アカウントとすべての記録を削除しました。ご利用ありがとうございました。" });
    }
  }, []);

  const supabase = createClient();
  const callbackUrl = () => `${window.location.origin}/auth/callback`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl() },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/onboarding");
        } else {
          setMessage({ type: "info", text: "確認メールを送りました。メール内のリンクを開くと登録が完了します。" });
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${callbackUrl()}?next=/settings/password`,
        });
        if (error) throw error;
        setMessage({ type: "info", text: "パスワード再設定用のメールを送りました。" });
      }
    } catch (err) {
      setMessage({ type: "error", text: translateError((err as Error).message) });
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setMessage({ type: "error", text: translateError(error.message) });
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl shadow-lg">🍚</div>
        <h1 className="text-2xl font-bold">もぐログ</h1>
        <p className="mt-1 text-sm text-gray-500">目標まで、あとどれくらい食べられる？</p>
      </div>

      {mode !== "reset" && (
        <>
          <button onClick={signInWithGoogle} disabled={loading} className="btn-secondary w-full py-3">
            <GoogleLogo />
            Googleで{mode === "signup" ? "登録" : "ログイン"}
          </button>
          <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-200" />
            またはメールアドレスで
            <div className="h-px flex-1 bg-gray-200" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          className="input"
          placeholder="メールアドレス"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {mode !== "reset" && (
          <input
            type="password"
            className="input"
            placeholder={mode === "signup" ? "パスワード（6文字以上）" : "パスワード"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
        {message && (
          <p className={`rounded-xl p-3 text-sm ${message.type === "error" ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-700"}`}>
            {message.text}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
          {loading ? "処理中…" : mode === "login" ? "ログイン" : mode === "signup" ? "新規登録" : "再設定メールを送る"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-400">
        <a href="/privacy" className="underline">
          プライバシーについて（なんでログインが必要？など）
        </a>
      </p>

      <div className="mt-4 space-y-2 text-center text-sm">
        {mode === "login" ? (
          <>
            <p>
              はじめての方は{" "}
              <button className="font-semibold text-brand-600" onClick={() => { setMode("signup"); setMessage(null); }}>
                新規登録
              </button>
            </p>
            <button className="text-gray-400" onClick={() => { setMode("reset"); setMessage(null); }}>
              パスワードを忘れた
            </button>
          </>
        ) : (
          <button className="font-semibold text-brand-600" onClick={() => { setMode("login"); setMessage(null); }}>
            ログイン画面に戻る
          </button>
        )}
      </div>
    </main>
  );
}

function translateError(msg: string) {
  if (msg.includes("Invalid login credentials")) return "メールアドレスまたはパスワードが違います。";
  if (msg.includes("Email not confirmed")) return "メールアドレスの確認が済んでいません。確認メールのリンクを開いてください。";
  if (msg.includes("User already registered")) return "このメールアドレスはすでに登録されています。";
  if (msg.includes("Password should be")) return "パスワードは6文字以上にしてください。";
  if (msg.toLowerCase().includes("rate limit")) return "短時間に操作が集中しました。しばらく待ってからお試しください。";
  if (msg.includes("provider is not enabled")) return "Googleログインがまだ有効になっていません（管理者の設定が必要です）。";
  return msg;
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
