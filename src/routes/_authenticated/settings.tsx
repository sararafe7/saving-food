import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UserX } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { fetchMyAccount, useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, errorMessage } from "@/lib/pilot";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "إعدادات الحساب | تنسيق فائض الطعام" },
      {
        name: "description",
        content: "بيانات حسابك في المنصة، وتعطيل الحساب عند الحاجة.",
      },
      { property: "og:title", content: "إعدادات الحساب" },
      { property: "og:description", content: "إدارة حسابك في منصة تنسيق فائض الطعام." },
    ],
  }),
  component: SettingsPage,
  errorComponent: () => (
    <AppShell title="إعدادات الحساب">
      <p className="text-sm text-muted-foreground">حدث خطأ. حدّث الصفحة وحاول مرة أخرى.</p>
    </AppShell>
  ),
});

function SettingsPage() {
  const { user } = useSession();

  const { data: account } = useQuery({
    queryKey: ["my-account", user?.id],
    enabled: !!user,
    queryFn: fetchMyAccount,
  });

  // Reports that have left the food source but are not delivered yet. The
  // database refuses the deactivation while any of them is open; this only
  // explains why before the user taps.
  const { data: openTasks = 0 } = useQuery({
    queryKey: ["open-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("open_task_count", { _user_id: user!.id });
      if (error) throw error;
      return data ?? 0;
    },
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("deactivate_account", { _user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("تم تعطيل حسابك");
      await supabase.auth.signOut();
      window.location.href = "/";
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر تعطيل الحساب")),
  });

  const blocked = openTasks > 0;

  return (
    <AppShell
      title="إعدادات الحساب"
      // exactOptionalPropertyTypes: omit the key instead of passing undefined.
      {...(account ? { subtitle: ROLE_LABEL[account.role] } : {})}
      backTo={null}
      showSignOut
    >
      <div className="card-surface space-y-1 p-4">
        <p className="font-bold">{account?.name ?? "—"}</p>
        <p className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
          {user?.email}
        </p>
        <p className="pt-1 text-xs text-muted-foreground">
          {account ? `حساب ${ROLE_LABEL[account.role]} مفعّل` : "—"}
        </p>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold text-muted-foreground">تعطيل الحساب</h2>
        <div className="card-surface space-y-3 p-4">
          <p className="text-sm">
            تعطيل الحساب يوقف الدخول إليه واستخدامه، لكنه <strong>لا يحذف</strong> بياناتك ولا سجلّ
            بلاغاتك ومهامك السابقة.
          </p>
          <p className="text-sm text-muted-foreground">
            لإعادة التفعيل لاحقًا ستحتاج إلى التواصل مع أحد المنسّقين.
          </p>

          {blocked ? (
            <p className="rounded-xl bg-secondary p-3 text-sm font-bold text-destructive">
              لديك {openTasks} مهمة جارية (مُسندة أو تم استلامها). أكملها حتى «تم التوصيل» أو اطلب
              من منسّق إعادة إسنادها، ثم عُد لتعطيل الحساب.
            </p>
          ) : null}

          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={blocked || deactivate.isPending || !user}
            onClick={() => {
              if (confirm("تعطيل حسابك؟ لن تتمكن من الدخول حتى يعيد أحد المنسّقين تفعيله.")) {
                deactivate.mutate();
              }
            }}
          >
            <UserX className="size-5" />
            تعطيل حسابي
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
