"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ProfileForm } from "@/components/ProfileForm";
import { FullScreenLoading } from "@/components/ProfileProvider";
import type { Profile } from "@/lib/types";

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<Profile> | undefined>();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data?.onboarded) return router.replace("/");
      setProfile(data ?? undefined);
      setUserId(user.id);
    })();
  }, [router]);

  if (!userId) return <FullScreenLoading />;

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">ようこそ！👋</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        からだの情報を入れると、1日の目標（カロリー・PFC）を提案します。あとから設定画面でいつでも変更できます。
      </p>
      <ProfileForm userId={userId} initial={profile} submitLabel="はじめる" onSaved={() => router.replace("/")} />
    </main>
  );
}
