import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { fetchMyAccount } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_HOME, type AppRole } from "@/lib/pilot";

// Which role may open each page. The database enforces the same rules; this
// only keeps people from landing on a screen that would be empty for them.
const PAGE_ROLE: Record<string, AppRole> = {
  "/coordinator": "coordinator",
  "/families": "coordinator",
  "/accounts": "coordinator",
  "/source": "source",
  "/worker": "worker",
};

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // /pending explains whichever of the three it is: no role yet, waiting for
    // approval, or deactivated.
    const account = await fetchMyAccount();
    if (!account || !account.approved || !account.active) throw redirect({ to: "/pending" });

    const required = PAGE_ROLE[location.pathname.replace(/\/$/, "")];
    if (required && required !== account.role) throw redirect({ href: ROLE_HOME[account.role] });

    return { user: data.user, role: account.role };
  },
  component: () => <Outlet />,
});
