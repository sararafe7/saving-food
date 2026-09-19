import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpCircle, CheckCircle2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccountFields, RoleSelect, readAccountProfile } from "@/components/AccountFields";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts, type Account } from "@/hooks/useAccounts";
import { supabase } from "@/integrations/supabase/client";
import { createAccount } from "@/lib/accounts.functions";
import { ROLE_LABEL, SOURCE_TYPE_LABEL, errorMessage, type AppRole } from "@/lib/pilot";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "إدارة الحسابات | تنسيق فائض الطعام" },
      {
        name: "description",
        content: "الموافقة على الحسابات الجديدة، وترقية الحسابات إلى منسّق، وإنشاء حسابات مباشرة.",
      },
      { property: "og:title", content: "إدارة الحسابات" },
      { property: "og:description", content: "إدارة الحسابات في منصة تنسيق فائض الطعام." },
    ],
  }),
  component: AccountsPage,
  errorComponent: () => (
    <AppShell title="إدارة الحسابات" backTo="/coordinator">
      <p className="text-sm text-muted-foreground">حدث خطأ. حدّث الصفحة وحاول مرة أخرى.</p>
    </AppShell>
  ),
});

function AccountsPage() {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const [creating, setCreating] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const approve = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("approve_account", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تفعيل الحساب");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر تفعيل الحساب")),
  });

  const promote = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("promote_to_coordinator", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت الترقية إلى منسّق");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّرت الترقية")),
  });

  const pending = accounts.filter((a) => !a.approved);
  const approvedByRole = (role: AppRole) => accounts.filter((a) => a.approved && a.role === role);

  return (
    <AppShell
      title="إدارة الحسابات"
      subtitle="الموافقة والترقية والإنشاء"
      showSignOut
      backTo="/coordinator"
    >
      <h2 className="mb-3 text-sm font-bold text-muted-foreground">
        بانتظار الموافقة ({pending.length})
      </h2>
      <ul className="space-y-3">
        {pending.map((account) => (
          <li key={account.user_id} className="card-surface p-4">
            <AccountSummary account={account} />
            <Button
              className="mt-3 w-full"
              disabled={approve.isPending}
              onClick={() => approve.mutate(account.user_id)}
            >
              <CheckCircle2 className="size-4" />
              موافقة وتفعيل
            </Button>
          </li>
        ))}
        {pending.length === 0 ? (
          <li className="text-sm text-muted-foreground">لا توجد حسابات بانتظار الموافقة.</li>
        ) : null}
      </ul>

      <div className="mt-8">
        {creating ? (
          <CreateAccountForm
            onDone={() => {
              setCreating(false);
              invalidate();
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setCreating(true)}
          >
            <UserPlus className="size-5" />
            إنشاء حساب مباشرة
          </Button>
        )}
      </div>

      {(["coordinator", "source", "worker"] as AppRole[]).map((role) => {
        const list = approvedByRole(role);
        return (
          <section key={role}>
            <h2 className="mb-3 mt-8 text-sm font-bold text-muted-foreground">
              {role === "coordinator"
                ? "المنسّقون"
                : role === "source"
                  ? "مصادر الطعام"
                  : "عمّال التوصيل"}{" "}
              ({list.length})
            </h2>
            <ul className="space-y-2">
              {list.map((account) => (
                <li key={account.user_id} className="card-surface p-3">
                  <AccountSummary account={account} compact />
                  {role !== "coordinator" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      disabled={promote.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `ترقية «${account.name ?? account.email}» إلى منسّق؟ سيفقد الحساب دوره الحالي (${ROLE_LABEL[role]}) ويستطيع رؤية بيانات جميع الأسر.`,
                          )
                        ) {
                          promote.mutate(account.user_id);
                        }
                      }}
                    >
                      <ArrowUpCircle className="size-4" />
                      ترقية إلى منسّق
                    </Button>
                  ) : null}
                </li>
              ))}
              {list.length === 0 ? (
                <li className="text-sm text-muted-foreground">لا يوجد.</li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </AppShell>
  );
}

function AccountSummary({ account, compact = false }: { account: Account; compact?: boolean }) {
  const details = [
    account.source_type ? SOURCE_TYPE_LABEL[account.source_type] : null,
    account.area ? `المنطقة: ${account.area}` : null,
    account.phone,
    account.org,
  ].filter(Boolean);

  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">{account.name ?? "—"}</p>
        {!compact ? (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-xs font-bold text-secondary-foreground">
            {ROLE_LABEL[account.role]}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
        {account.email}
      </p>
      {details.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{details.join(" · ")}</p>
      ) : null}
      {account.address ? <p className="text-xs text-muted-foreground">{account.address}</p> : null}
      {!account.active ? <p className="mt-1 text-xs font-bold text-destructive">غير نشط</p> : null}
    </div>
  );
}

function CreateAccountForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const create = useServerFn(createAccount);
  const [role, setRole] = useState<AppRole>("source");

  const submit = useMutation({
    mutationFn: async (fd: FormData) => {
      const profile = readAccountProfile(role, fd);
      await create({
        data: {
          ...profile,
          email: String(fd.get("email") ?? ""),
          password: String(fd.get("password") ?? ""),
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إنشاء الحساب وتفعيله");
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر إنشاء الحساب")),
  });

  return (
    <form
      className="card-surface space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate(new FormData(e.currentTarget));
      }}
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <UserPlus className="size-4 text-primary" />
        إنشاء حساب مُفعَّل مباشرة
      </p>
      <RoleSelect value={role} onChange={setRole} />
      <AccountFields key={role} role={role} idPrefix="create" />
      <div className="space-y-2">
        <Label htmlFor="create-email">البريد الإلكتروني</Label>
        <Input
          id="create-email"
          name="email"
          type="email"
          required
          dir="ltr"
          className="text-start"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="create-password">كلمة مرور مؤقتة (8 أحرف على الأقل)</Label>
        <Input
          id="create-password"
          name="password"
          required
          minLength={8}
          dir="ltr"
          className="text-start"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={submit.isPending}>
          إنشاء الحساب
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
