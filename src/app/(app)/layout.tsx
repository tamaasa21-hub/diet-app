import { BottomNav } from "@/components/BottomNav";
import { ProfileProvider } from "@/components/ProfileProvider";
import { ToastProvider } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <ToastProvider>
        <main className="mx-auto max-w-lg px-4 pb-28">{children}</main>
        <BottomNav />
      </ToastProvider>
    </ProfileProvider>
  );
}
