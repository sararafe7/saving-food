import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Hourglass, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AccountFields, RoleSelect, readAccountProfile } from "@/components/AccountFields";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { fetchMyAccount, useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_HOME, ROLE_LABEL, errorMessage, type AppRole } from "@/lib/pilot";

export const Route = createFileRoute("/pending")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الحساب بانتظار الموافقة | تنسيق فائض الطعام" },
      {
        name: "description",
        content: "حسابك مسجّل وبانتظار موافقة أحد المنسّقين لتفعيله.",
      },
      { property: "og:title", content: "الحساب بانتظار الموافقة" },
      { property: "og:description", content: "بانتظار موافقة أحد المنسّقين." },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  const { user, ready } = useSession();
  const account = useQuery({
    queryKey: ["my-account", user?.id],
    enabled: !!user,
    queryFn: fetchMyAccount,
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (account.data?.approved && account.data.active) {
      window.location.href = ROLE_HOME[account.data.role];
    }
  }, [account.data]);

  if (!ready || (user && account.isPending)) {
    return (
      <AppShell title="حالة الحساب">
        <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="حالة الحساب">
        <p className="text-sm text-muted-foreground">سجّل الدخول لمتابعة حالة حسابك.</p>
        <Button asChild size="lg" className="mt-4 w-full">
          <Link to="/auth">الدخول</Link>
        </Button>
      </AppShell>
    );
  }

  if (!account.data) {
    return (
      <CompleteRegistration suggestedName={suggestedName(user)} onDone={() => account.refetch()} />
    );
  }

  if (!account.data.active) {
    return (
      <AppShell title="الحساب معطّل" showSignOut>
        <div className="card-surface flex flex-col items-center gap-3 p-6 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <UserX className="size-7" />
          </span>
          <p className="font-bold">هذا الحساب معطّل</p>
          <p className="text-sm text-muted-foreground">
            لم تُحذف بياناتك ولا سجلّ مهامك السابقة، لكن لا يمكن استخدام الحساب وهو معطّل. تواصل مع
            أحد المنسّقين لإعادة تفعيله.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="بانتظار الموافقة" showSignOut>
      <div className="card-surface flex flex-col items-center gap-3 p-6 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
          <Hourglass className="size-7" />
        </span>
        <p className="font-bold">حساب {ROLE_LABEL[account.data.role]} بانتظار الموافقة</p>
        <p className="text-sm text-muted-foreground">
          سيُفعَّل حسابك بعد أن يوافق عليه أحد المنسّقين. تتحدّث هذه الصفحة تلقائيًا.
        </p>
        <Button variant="secondary" disabled={account.isFetching} onClick={() => account.refetch()}>
          تحقّق الآن
        </Button>
      </div>
    </AppShell>
  );
}

/** Google gives us a display name; fall back to the part of the e-mail before the @. */
function suggestedName(user: { email?: string; user_metadata?: Record<string, unknown> } | null) {
  const meta = user?.user_metadata ?? {};
  const fromGoogle = meta["full_name"] ?? meta["name"];
  if (typeof fromGoogle === "string" && fromGoogle.trim()) return fromGoogle.trim();
  return user?.email?.split("@")[0] ?? "";
}

/**
 * The profile step for any account that exists in auth but has no role yet:
 * a first Google sign-in (Google only supplies a name and an e-mail), or an
 * account created before sign-up moved into the database. It collects the same
 * role-specific fields as the e-mail sign-up form, then waits for approval.
 */
function CompleteRegistration({
  suggestedName: initialName,
  onDone,
}: {
  suggestedName: string;
  onDone: () => void;
}) {
  const [role, setRole] = useState<AppRole>("source");

  const complete = useMutation({
    mutationFn: async (fd: FormData) => {
      const profile = readAccountProfile(role, fd);
      const { error } = await supabase.rpc("complete_registration", { _profile: profile });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم استكمال التسجيل");
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر استكمال التسجيل")),
  });

  return (
    <AppShell title="أكمل بيانات حسابك" showSignOut>
      <p className="mb-4 text-sm text-muted-foreground">
        اختر نوع حسابك وأكمل بياناته ليراجعها أحد المنسّقين. يُفعَّل الحساب بعد الموافقة.
      </p>
      <form
        className="card-surface space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          complete.mutate(new FormData(e.currentTarget));
        }}
      >
        <RoleSelect value={role} onChange={setRole} />
        <AccountFields key={role} role={role} idPrefix="complete" defaultName={initialName} />
        <Button type="submit" size="lg" className="w-full" disabled={complete.isPending}>
          إرسال
        </Button>
      </form>
    </AppShell>
  );
}
