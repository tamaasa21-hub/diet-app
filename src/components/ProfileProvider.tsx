"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Ctx = { profile: Profile; userId: string; email: string | null; reload: () => Promise<void> };
const ProfileContext = createContext<Ctx | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}

/** ログイン中ユーザーのプロフィールを読み込み、初回設定が未完了なら /onboarding へ */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ profile: Profile; userId: string; email: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) {
      setError(error.message);
      return;
    }
    if (!data || !data.onboarded) {
      router.replace("/onboarding");
      return;
    }
    setState({ profile: data as Profile, userId: user.id, email: user.email ?? null });
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        読み込みに失敗しました：{error}
        <br />
        <button className="btn-secondary mt-4" onClick={() => location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }
  if (!state) return <FullScreenLoading />;

  return <ProfileContext.Provider value={{ ...state, reload: load }}>{children}</ProfileContext.Provider>;
}

export function FullScreenLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
    </div>
  );
}
