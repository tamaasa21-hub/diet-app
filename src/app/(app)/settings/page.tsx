"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { ProfileForm } from "@/components/ProfileForm";
import { PageHeader, useToast } from "@/components/ui";
import { DataExport, DeleteAccount } from "@/components/AccountData";
import { ClaudeConnect } from "@/components/ClaudeConnect";

export default function SettingsPage() {
  const { profile, userId, email, reload } = useProfile();
  const router = useRouter();
  const toast = useToast();

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="設定" />

      <section className="card mb-4 p-0">
        <MenuLink href="/foods" label="🥚 マイ食品（よく食べるもの）" />
        <MenuLink href="/recipes" label="🍲 自作料理" />
        <MenuLink href="/settings/password" label="🔑 パスワード変更" />
        <MenuLink href="/privacy" label="🔒 プライバシーについて" />
      </section>

      <div className="mb-4">
        <ClaudeConnect />
      </div>

      <h2 className="mb-2 font-bold">プロフィールと目標</h2>
      <ProfileForm
        userId={userId}
        initial={profile}
        submitLabel="保存する"
        onSaved={async () => {
          await reload();
          toast("保存しました");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <div className="mt-8 space-y-3">
        <DataExport />
        <DeleteAccount />
      </div>

      <section className="mt-8 space-y-3 text-center">
        <p className="text-xs text-gray-400">ログイン中：{email}</p>
        <button onClick={logout} className="btn-secondary w-full">
          ログアウト
        </button>
        <p className="text-[11px] leading-relaxed text-gray-400">
          目標値の提案は一般的な計算式（Mifflin-St Jeor式）による目安です。
          <br />
          体調や成長期に合わせて、必要なら専門家に相談してください。
        </p>
      </section>
    </div>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between border-b border-gray-50 px-4 py-3.5 last:border-0 active:bg-gray-50">
      <span>{label}</span>
      <span className="text-gray-300">›</span>
    </Link>
  );
}
