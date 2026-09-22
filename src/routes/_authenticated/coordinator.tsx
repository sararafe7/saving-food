import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, StickyNote, UserCheck, Users, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts, type Account } from "@/hooks/useAccounts";
import { supabase } from "@/integrations/supabase/client";
import {
  FAMILY_COLUMNS,
  POST_COLUMNS,
  ROLE_LABEL,
  errorMessage,
  formatTime,
  type ClaimMode,
  type Family,
  type SurplusPost,
} from "@/lib/pilot";

export const Route = createFileRoute("/_authenticated/coordinator")({
  head: () => ({
    meta: [
      { title: "شاشة المنسّق | تنسيق فائض الطعام" },
      {
        name: "description",
        content:
          "راجع الفائض المنشور، اختر الأسرة المستفيدة، وافتح المهمة للحجز أو أسندها لعامل توصيل.",
      },
      { property: "og:title", content: "شاشة المنسّق" },
      {
        property: "og:description",
        content: "توزيع الفائض على الأسر وعمّال التوصيل، مع ملاحظات داخلية للمنسّقين.",
      },
    ],
  }),
  component: CoordinatorPage,
  errorComponent: () => (
    <AppShell title="شاشة المنسّق">
      <p className="text-sm text-muted-foreground">حدث خطأ. حدّث الصفحة وحاول مرة أخرى.</p>
    </AppShell>
  ),
});

type Filter = "new" | "open" | "active" | "delivered" | "all";

const FILTERS: { key: Filter; label: string; match: (p: SurplusPost) => boolean }[] = [
  { key: "new", label: "بانتظار التوزيع", match: (p) => p.status === "posted" && !p.claim_mode },
  {
    key: "open",
    label: "مفتوحة للحجز",
    match: (p) => p.status === "posted" && p.claim_mode === "open",
  },
  {
    key: "active",
    label: "قيد التوصيل",
    match: (p) => p.status === "assigned" || p.status === "picked_up",
  },
  { key: "delivered", label: "تم التوصيل", match: (p) => p.status === "delivered" },
  { key: "all", label: "الكل", match: () => true },
];

function CoordinatorPage() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("new");

  const { data: me } = useQuery({
    queryKey: ["my-coordinator"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("coordinators")
        .select("id,name,org")
        .eq("user_id", userData.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["coordinator-posts"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("surplus_posts")
        .select(POST_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SurplusPost[];
    },
  });

  const { data: families = [] } = useQuery({
    queryKey: ["families"],
    queryFn: async () => {
      const { data, error } = await supabase.from("families").select(FAMILY_COLUMNS).order("name");
      if (error) throw error;
      return data as Family[];
    },
  });

  const { data: accounts = [] } = useAccounts();
  const allWorkers = accounts.filter((a) => a.role === "worker" && a.profile_id);
  const availableWorkers = allWorkers.filter((a) => a.approved && a.active);
  const pendingAccounts = accounts.filter((a) => !a.approved).length;

  // Accounts that switched themselves off in the last 30 days. Nobody is
  // e-mailed about it, so the dashboard is where coordinators find out.
  const { data: selfDeactivations = [] } = useQuery({
    queryKey: ["self-deactivations"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("recent_self_deactivations");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: notes = {} } = useQuery({
    queryKey: ["post-notes"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("post_notes").select("post_id,note");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.post_id] = row.note;
      return map;
    },
  });

  const dispatch = useMutation({
    mutationFn: async (input: {
      postId: string;
      familyId: string;
      mode: ClaimMode;
      workerId: string;
      meetingPoint: string;
    }) => {
      const { error } = await supabase.rpc("coordinator_dispatch", {
        _post_id: input.postId,
        _family_id: input.familyId,
        _mode: input.mode,
        ...(input.mode === "direct" ? { _worker_id: input.workerId } : {}),
        ...(input.meetingPoint.trim() ? { _meeting_point: input.meetingPoint } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.mode === "open" ? "المهمة مفتوحة الآن لعمّال المنطقة" : "تم الإسناد");
      setOpenId(null);
      queryClient.invalidateQueries({ queryKey: ["coordinator-posts"] });
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر الحفظ")),
  });

  const saveNote = useMutation({
    mutationFn: async ({ postId, note }: { postId: string; note: string }) => {
      if (!note.trim()) {
        const { error } = await supabase.from("post_notes").delete().eq("post_id", postId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("post_notes")
        .upsert({ post_id: postId, note: note.trim() }, { onConflict: "post_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الملاحظة");
      queryClient.invalidateQueries({ queryKey: ["post-notes"] });
    },
    onError: () => toast.error("تعذّر حفظ الملاحظة"),
  });

  const familyName = (id: string | null) =>
    families.find((f) => f.id === id)?.name ?? "أسرة محذوفة";
  const workerName = (id: string | null) =>
    allWorkers.find((w) => w.profile_id === id)?.name ?? "—";

  const current = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;
  const visible = posts.filter(current.match);

  return (
    <AppShell
      title={me?.name ? `لوحة ${me.name}` : "لوحة المنسّق"}
      subtitle={me?.org ?? "المنسّق"}
      showSignOut
      showSettings
      backTo={null}
    >
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Link
          to="/families"
          className="card-surface flex items-center gap-3 p-3 active:bg-secondary"
        >
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">الأسر المستفيدة</span>
            <span className="block text-xs text-muted-foreground">{families.length} أسرة</span>
          </span>
        </Link>
        <Link
          to="/accounts"
          className="card-surface flex items-center gap-3 p-3 active:bg-secondary"
        >
          <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UserCheck className="size-5" />
            {pendingAccounts > 0 ? (
              <span className="absolute -top-1 -end-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                {pendingAccounts}
              </span>
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">الحسابات</span>
            <span className="block text-xs text-muted-foreground">
              {pendingAccounts > 0 ? `${pendingAccounts} بانتظار الموافقة` : "لا طلبات جديدة"}
            </span>
          </span>
        </Link>
      </div>

      {selfDeactivations.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <UserX className="size-4 text-destructive" />
            حسابات عطّلها أصحابها
          </h2>
          <ul className="space-y-2">
            {selfDeactivations.map((item) => (
              <li key={item.user_id} className="card-surface p-3">
                <p className="text-sm font-bold">{item.name ?? item.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ROLE_LABEL[item.role]} · عطّل حسابه بنفسه {formatTime(item.deactivated_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => {
          const count = posts.filter(f.match).length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <ul className="space-y-3">
        {visible.map((post) => {
          const isOpen = openId === post.id;
          return (
            <li key={post.id} className="card-surface overflow-hidden">
              <button
                type="button"
                className="w-full p-4 text-start"
                onClick={() => setOpenId(isOpen ? null : post.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold leading-snug">{post.food_description}</p>
                  <StatusBadge status={post.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {post.quantity} · جاهز {formatTime(post.ready_time)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {post.restaurant_name} — {post.pickup_location}
                  {post.area ? ` · ${post.area}` : ""}
                </p>
                {post.family_id ? (
                  <p className="mt-1 text-sm font-bold text-primary">
                    الأسرة: {familyName(post.family_id)}
                  </p>
                ) : null}
                {post.status === "posted" && post.claim_mode === "open" ? (
                  <p className="mt-1 text-sm text-muted-foreground">مفتوحة لحجز عمّال المنطقة</p>
                ) : null}
                {post.worker_id ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    عامل التوصيل: {workerName(post.worker_id)}
                    {post.claim_mode === "open" ? " (حجزها بنفسه)" : ""}
                  </p>
                ) : null}
                {post.picked_up_at || post.delivered_at ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {post.picked_up_at ? `استُلم ${formatTime(post.picked_up_at)}` : ""}
                    {post.delivered_at ? ` · وُصّل ${formatTime(post.delivered_at)}` : ""}
                  </p>
                ) : null}
                {post.is_confidential ? (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
                    <ShieldCheck className="size-3.5" /> حالة سرّية
                  </p>
                ) : null}
                {notes[post.id] ? (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <StickyNote className="size-3.5" /> ملاحظة داخلية
                  </p>
                ) : null}
              </button>

              {isOpen ? (
                <DispatchPanel
                  post={post}
                  families={families}
                  workers={availableWorkers}
                  note={notes[post.id] ?? ""}
                  pending={dispatch.isPending}
                  notePending={saveNote.isPending}
                  onDispatch={(values) => dispatch.mutate({ postId: post.id, ...values })}
                  onSaveNote={(note) => saveNote.mutate({ postId: post.id, note })}
                />
              ) : null}
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="text-sm text-muted-foreground">لا توجد بلاغات في هذا القسم.</li>
        ) : null}
      </ul>
    </AppShell>
  );
}

function DispatchPanel({
  post,
  families,
  workers,
  note,
  pending,
  notePending,
  onDispatch,
  onSaveNote,
}: {
  post: SurplusPost;
  families: Family[];
  workers: Account[];
  note: string;
  pending: boolean;
  notePending: boolean;
  onDispatch: (values: {
    familyId: string;
    mode: ClaimMode;
    workerId: string;
    meetingPoint: string;
  }) => void;
  onSaveNote: (note: string) => void;
}) {
  const [familyId, setFamilyId] = useState(post.family_id ?? "");
  const [mode, setMode] = useState<ClaimMode>(post.claim_mode ?? "direct");
  const [workerId, setWorkerId] = useState(post.worker_id ?? "");
  const [meetingPoint, setMeetingPoint] = useState(
    post.is_confidential ? (post.delivery_destination ?? "") : "",
  );
  const family = families.find((f) => f.id === familyId);
  const effectiveMode: ClaimMode = family?.is_sensitive ? "direct" : mode;
  const locked = post.status === "picked_up" || post.status === "delivered";
  const ready =
    !!family &&
    (effectiveMode === "open" || !!workerId) &&
    (!family.is_sensitive || meetingPoint.trim().length > 0);

  return (
    <div className="space-y-4 border-t border-border bg-secondary/40 p-4">
      {locked ? (
        <p className="text-xs text-muted-foreground">تم استلام الطعام — لا يمكن تعديل التوزيع.</p>
      ) : (
        <>
          <div className="space-y-2">
            <Label>الأسرة المستفيدة</Label>
            <Select value={familyId} onValueChange={setFamilyId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر أسرة" />
              </SelectTrigger>
              <SelectContent>
                {families.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                    {f.neighborhood ? ` · ${f.neighborhood}` : ""}
                    {f.is_sensitive ? " · سرّية" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {families.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                أضف أسرة أولًا من صفحة الأسر المستفيدة.
              </p>
            ) : null}
          </div>

          {family?.is_sensitive ? (
            <div className="space-y-2">
              <Label htmlFor={`mp-${post.id}`}>نقطة اللقاء التي سيراها عامل التوصيل</Label>
              <Input
                id={`mp-${post.id}`}
                value={meetingPoint}
                onChange={(e) => setMeetingPoint(e.target.value)}
                placeholder="مثال: قرب مسجد الفتح، الساعة 5:00 مساءً"
              />
              <p className="text-xs text-muted-foreground">
                حالة سرّية: تُسند مباشرة لعامل محدد، ولن يرى اسم الأسرة ولا عنوانها.
              </p>
            </div>
          ) : family ? (
            <>
              <div className="space-y-2">
                <Label>طريقة التوزيع</Label>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
                  {(
                    [
                      ["open", "مفتوحة للحجز"],
                      ["direct", "إسناد مباشر"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-xl py-2 text-sm font-bold ${mode === value ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                      onClick={() => setMode(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "open"
                  ? `يرى عمّال المنطقة الحي (${family.neighborhood ?? "غير محدد"}) والمسافة التقريبية فقط، ويظهر العنوان لمن يحجز المهمة.`
                  : `سيرى عامل التوصيل عنوان التوصيل: ${family.address}`}
              </p>
            </>
          ) : null}

          {family && effectiveMode === "direct" ? (
            <div className="space-y-2">
              <Label>عامل التوصيل</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر عامل توصيل" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((w) => (
                    <SelectItem key={w.profile_id!} value={w.profile_id!}>
                      {w.name}
                      {w.area ? ` · ${w.area}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <Button
            className="w-full"
            size="lg"
            disabled={pending || !ready}
            onClick={() => onDispatch({ familyId, mode: effectiveMode, workerId, meetingPoint })}
          >
            {effectiveMode === "open"
              ? "فتح المهمة للحجز"
              : post.worker_id
                ? "تحديث الإسناد"
                : "إسناد المهمة"}
          </Button>
        </>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          onSaveNote(String(fd.get("note") ?? ""));
        }}
      >
        <Label htmlFor={`note-${post.id}`}>ملاحظة داخلية (للمنسّقين فقط)</Label>
        <Textarea
          id={`note-${post.id}`}
          name="note"
          rows={2}
          defaultValue={note}
          placeholder="مثال: التنسيق مع الأسرة قبل الساعة 5"
        />
        <Button type="submit" variant="secondary" disabled={notePending}>
          حفظ الملاحظة
        </Button>
      </form>
    </div>
  );
}
