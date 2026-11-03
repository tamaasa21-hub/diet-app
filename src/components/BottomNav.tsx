"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "ホーム", icon: HomeIcon },
  { href: "/stats", label: "集計", icon: ChartIcon },
  { href: "/add", label: "記録", icon: PlusIcon, primary: true },
  { href: "/weight", label: "体重", icon: ScaleIcon },
  { href: "/settings", label: "設定", icon: GearIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg items-end justify-around px-2 pt-1.5">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          if (primary) {
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="-mt-5 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-brand-600 text-white shadow-lg active:scale-95"
                  aria-label={label}
                >
                  <Icon className="h-7 w-7" />
                </Link>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex w-14 flex-col items-center gap-0.5 py-1 text-[11px] ${
                  active ? "text-brand-600" : "text-gray-400"
                }`}
              >
                <Icon className="h-6 w-6" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type IconProps = { className?: string };
function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}
function HomeIcon(p: IconProps) {
  return <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></Svg>;
}
function ChartIcon(p: IconProps) {
  return <Svg {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></Svg>;
}
function PlusIcon(p: IconProps) {
  return <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
}
function ScaleIcon(p: IconProps) {
  return <Svg {...p}><path d="M3 17l3-9 3 9" /><path d="M15 17l3-9 3 9" /><path d="M3 17a3 2 0 0 0 6 0M15 17a3 2 0 0 0 6 0" /><path d="M12 4v16M6 8h12M8 20h8" /></Svg>;
}
function GearIcon(p: IconProps) {
  return <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></Svg>;
}
