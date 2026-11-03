"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, useToast } from "@/components/ui";

export default function PasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("確認用のパスワードが一致しません。");
    const { error } = await createClient().auth.updateUser({ password });
    if (error) return setError(error.message);
    toast("パスワードを変更しました");
    router.replace("/settings");
  }

  return (
    <div>
      <PageHeader title="パスワード変更" back="/settings" />
      <form onSubmit={submit} className="card space-y-3">
        <p className="text-xs text-gray-500">Googleでログインしている場合も、ここで設定するとメール＋パスワードでもログインできるようになります。</p>
        <input type="password" className="input" placeholder="新しいパスワード（6文字以上）" minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input type="password" className="input" placeholder="確認のためもう一度" minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full">変更する</button>
      </form>
    </div>
  );
}
