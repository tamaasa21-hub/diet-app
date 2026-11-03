import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** サーバー（Route Handler など）用の Supabase クライアント */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component から呼ばれた場合は無視（middleware がセッションを更新する）
          }
        },
      },
    },
  );
}
