import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Activity, Cpu, Layers, UserRound } from "lucide-react";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { BrandMark } from "@/components/BrandMark";
import { BrowserRigProvider } from "@/components/miner/browser-rig";
import { profilesQuery } from "@/lib/miner-data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profilesQuery),
  component: DashboardLayout,
});

const tabs = [
  { to: "/dashboard", label: "Rigs", icon: Cpu, exact: true },
  { to: "/dashboard/health", label: "Health", icon: Activity, exact: false },
  { to: "/dashboard/profiles", label: "Coins & pools", icon: Layers, exact: false },
  { to: "/dashboard/account", label: "Account", icon: UserRound, exact: false },
] as const;

function DashboardLayout() {
  return (
    <BrowserRigProvider>
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-5">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-3">
            <BrandMark />
            <span className="text-lg font-bold">GYDS Miner</span>
          </Link>
        </header>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur sm:static sm:mb-5 sm:border-0 sm:bg-transparent">
          <ul className="mx-auto flex max-w-5xl justify-around sm:justify-start sm:gap-2 sm:px-0">
            {tabs.map(({ to, label, icon: Icon, exact }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact }}
                  className="flex flex-col items-center gap-0.5 px-4 py-2 text-[11px] text-muted-foreground sm:flex-row sm:gap-2 sm:rounded-lg sm:text-sm data-[status=active]:text-signal sm:data-[status=active]:bg-accent"
                >
                  <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <AppUpdateNotice />
        <Outlet />
      </div>
    </BrowserRigProvider>
  );
}
