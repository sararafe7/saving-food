import { Link } from "@tanstack/react-router";
import { ChevronLeft, LogOut, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

export function AppShell({
  title,
  subtitle,
  showSignOut = false,
  showSettings = false,
  backTo = "/",
  children,
}: {
  title: string;
  subtitle?: string;
  showSignOut?: boolean;
  /** Shows the gear that leads to /settings; only for signed-in screens with a role. */
  showSettings?: boolean;
  /** Where the back arrow goes; null hides it (e.g. on a role's home screen). */
  backTo?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          {backTo ? (
            <Link
              to={backTo}
              aria-label="رجوع"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground"
            >
              <ChevronLeft className="size-5 rotate-180" />
            </Link>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {showSettings ? (
            <Link
              to="/settings"
              aria-label="إعدادات الحساب"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
            >
              <Settings className="size-4" />
            </Link>
          ) : null}
          {showSignOut ? (
            <button
              type="button"
              aria-label="خروج"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
            >
              <LogOut className="size-4" />
            </button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-5">{children}</main>
    </div>
  );
}
