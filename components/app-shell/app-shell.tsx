import { NavLinks } from "@/components/app-shell/nav-links";
import {
  UserMenu,
  type AppShellUser,
} from "@/components/app-shell/user-menu";

export function AppShell({
  user,
  children,
}: {
  user: AppShellUser;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/95 sticky top-0 z-40 border-b backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="flex h-11 items-center gap-4 px-4">
          <span className="shrink-0 text-sm font-semibold tracking-tight">
            VBXSystem0
          </span>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <NavLinks />
          </div>
          <UserMenu user={user} />
        </div>
      </header>
      <main className="px-4 py-4">{children}</main>
    </div>
  );
}
