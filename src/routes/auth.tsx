import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AccountFields, RoleSelect, readAccountProfile } from "@/components/AccountFields";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchMyAccount, type MyAccount } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_HOME, errorMessage, type AppRole } from "@/lib/pilot";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "الدخول وإنشاء حساب | تنسيق فائض الطعام" },
      {
        name: "description",
        content: "دخول مصادر الطعام وعمّال التوصيل والمنسّقين إلى منصة تنسيق فائض الطعام.",
      },
      { property: "og:title", content: "الدخول | تنسيق فائض الطعام" },
      {
        property: "og:description",
        content: "أنشئ حساب مصدر طعام أو عامل توصيل أو منسّق، ثم انتظر موافقة أحد المنسّقين.",
      },
    ],
  }),
  component: AuthPage,
  errorComponent: () => (
    <AppShell title="الدخول">
      <p className="text-sm text-muted-foreground">حدث خطأ. حدّث الصفحة وحاول مرة أخرى.</p>
    </AppShell>
  ),
});

function goHome(account: MyAccount, navigate: ReturnType<typeof useNavigate>) {
  if (account?.approved) {
    window.location.href = ROLE_HOME[account.role];
    return;
  }
  navigate({ to: "/pending" });
}

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <AppShell title="الدخول إلى المنصة" subtitle="تنسيق فائض الطعام">
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
        <button
          type="button"
          className={`rounded-xl py-2 text-sm font-bold ${mode === "signin" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setMode("signin")}
        >
          دخول
        </button>
        <button
          type="button"
          className={`rounded-xl py-2 text-sm font-bold ${mode === "signup" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setMode("signup")}
        >
          حساب جديد
        </button>
      </div>
      {mode === "signin" ? <SignIn /> : <SignUp />}
    </AppShell>
  );
}

function SignIn() {
  const navigate = useNavigate();

  const signIn = useMutation({
    mutationFn: async (form: { email: string; password: string }) => {
      const { error } = await supabase.auth.signInWithPassword(form);
      if (error) throw error;
      return fetchMyAccount();
    },
    onSuccess: (account) => goHome(account, navigate),
    onError: () => toast.error("البريد الإلكتروني أو كلمة المرور غير صحيحة، أو لم تؤكّد بريدك بعد"),
  });

  return (
    <form
      className="card-surface space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        signIn.mutate({
          email: String(fd.get("email") ?? ""),
          password: String(fd.get("password") ?? ""),
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          dir="ltr"
          className="text-start"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">كلمة المرور</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={signIn.isPending}>
        دخول
      </Button>
    </form>
  );
}

function SignUp() {
  const navigate = useNavigate();
  const [role, setRole] = useState<AppRole>("source");

  const signUp = useMutation({
    mutationFn: async (fd: FormData) => {
      const profile = readAccountProfile(role, fd);
      const { data, error } = await supabase.auth.signUp({
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        options: {
          // Read by the on_auth_user_created database trigger to create the role and profile.
          data: profile,
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
      if (!data.session) return { confirmationNeeded: true as const, account: null };
      return { confirmationNeeded: false as const, account: await fetchMyAccount() };
    },
    onSuccess: (result) => {
      if (result.confirmationNeeded) {
        toast.success("تم إنشاء الحساب — أكّد بريدك الإلكتروني ثم ادخل");
        return;
      }
      toast.success("تم إنشاء الحساب");
      goHome(result.account, navigate);
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر إنشاء الحساب")),
  });

  return (
    <form
      className="card-surface space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        signUp.mutate(new FormData(e.currentTarget));
      }}
    >
      <RoleSelect value={role} onChange={setRole} />
      <AccountFields key={role} role={role} idPrefix="signup" />

      <div className="space-y-2">
        <Label htmlFor="signup-email">البريد الإلكتروني</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          dir="ltr"
          className="text-start"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">كلمة المرور (8 أحرف على الأقل)</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        يُفعَّل الحساب بعد موافقة أحد المنسّقين. أول حساب يُسجَّل في المنصة يصبح منسّقًا تلقائيًا.
      </p>

      <Button type="submit" size="lg" className="w-full" disabled={signUp.isPending}>
        إنشاء الحساب
      </Button>
    </form>
  );
}
