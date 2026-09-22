import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/pilot";

export type MyAccount = {
  role: AppRole;
  approved: boolean;
  /** false once the account has been deactivated — it keeps its history but loses every permission. */
  active: boolean;
  name: string | null;
} | null;

/** The signed-in user's role, approval and active flag (each account has at most one role). */
export async function fetchMyAccount(): Promise<MyAccount> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase.rpc("my_account");
  if (error) throw error;
  const row = data?.[0];
  return row
    ? { role: row.role as AppRole, approved: row.approved, active: row.active, name: row.name }
    : null;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, ready, user: session?.user ?? null };
}

export function useMyRole() {
  const { user, ready } = useSession();

  const query = useQuery({
    queryKey: ["my-role", user?.id],
    enabled: !!user,
    queryFn: fetchMyAccount,
  });

  return {
    user,
    sessionReady: ready,
    role: query.data?.role ?? null,
    approved: query.data?.approved ?? false,
    active: query.data?.active ?? true,
    loading: !ready || (!!user && query.isPending),
  };
}
