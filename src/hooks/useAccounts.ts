import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Account = Database["public"]["Functions"]["list_accounts"]["Returns"][number];

/** Every account with its profile summary. Coordinators only (empty for anyone else). */
export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_accounts");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });
}
