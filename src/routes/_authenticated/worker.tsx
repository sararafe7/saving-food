import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Clock,
  ExternalLink,
  Hand,
  LocateFixed,
  MapPin,
  Navigation,
  Route as RouteIcon,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Fact, PickupWindowFact, PostHeader, SourceFact } from "@/components/PostFacts";
import { StatusBadge } from "@/components/StatusBadge";
import { useSuccessOverlay } from "@/components/SuccessOverlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  currentPosition,
  distanceKm,
  errorMessage,
  formatApproxKm,
  formatPickupWindow,
  formatTime,
  SOURCE_TYPE_LABEL,
  type DeliveryWorker,
  type LatLng,
  type Status,
} from "@/lib/pilot";

type Task = Database["public"]["Functions"]["worker_tasks"]["Returns"][number];
type PoolItem = Database["public"]["Functions"]["worker_open_pool"]["Returns"][number];

export const Route = createFileRoute("/_authenticated/worker")({
  head: () => ({
    meta: [
      { title: "شاشة عامل التوصيل | تنسيق فائض الطعام" },
      {
        name: "description",
        content:
          "احجز المهام المتاحة في منطقتك أو نفّذ المهام المسندة إليك، وسجّل الاستلام ثم التوصيل.",
      },
      { property: "og:title", content: "شاشة عامل التوصيل" },
      {
        property: "og:description",
        content: "مهامك مع موقع الاستلام ووجهة التوصيل، بزرين فقط: استلمت، وصّلت.",
      },
    ],
  }),
  component: WorkerPage,
  errorComponent: () => (
    <AppShell title="شاشة عامل التوصيل">
      <p className="text-sm text-muted-foreground">حدث خطأ. حدّث الصفحة وحاول مرة أخرى.</p>
    </AppShell>
  ),
});

function mapsLink(lat: number | null, lng: number | null) {
  return lat == null || lng == null
    ? null
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function WorkerPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"tasks" | "pool">("tasks");
  const [editingProfile, setEditingProfile] = useState(false);
  const [myPosition, setMyPosition] = useState<LatLng | null>(null);
  const { confirm, overlay } = useSuccessOverlay();

  const { data: worker, isPending } = useQuery({
    queryKey: ["my-worker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_workers")
        .select("id,name,phone,area,active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as DeliveryWorker | null) ?? null;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["worker-tasks", worker?.id],
    enabled: !!worker,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("worker_tasks");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pool = [] } = useQuery({
    queryKey: ["worker-pool", worker?.id],
    enabled: !!worker,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("worker_open_pool");
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["worker-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["worker-pool"] });
  };

  const claim = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc("worker_claim", { _post_id: postId });
      if (error) throw error;
    },
    onSuccess: () => {
      confirm("تم حجز المهمة", "العنوان الكامل ظاهر الآن في «مهامي»");
      setTab("tasks");
      refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error, "تعذّر حجز المهمة"));
      refresh();
    },
  });

  const advance = useMutation({
    mutationFn: async ({ postId, next }: { postId: string; next: "picked_up" | "delivered" }) => {
      const { error } = await supabase.rpc("worker_advance", { _post_id: postId, _next: next });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      if (vars.next === "picked_up") {
        confirm("تم تسجيل الاستلام", "اضغط «تم التوصيل» عند تسليم الطعام");
      } else {
        confirm("تم تسجيل التوصيل", "شكرًا لك!");
      }
      refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error, "تعذّر التحديث"));
      refresh();
    },
  });

  const locate = useMutation({
    mutationFn: currentPosition,
    onSuccess: setMyPosition,
    onError: (error) => toast.error(errorMessage(error, "تعذّر تحديد موقعك")),
  });

  if (isPending) {
    return (
      <AppShell title="شاشة عامل التوصيل" showSignOut backTo={null}>
        <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
      </AppShell>
    );
  }

  if (!worker) {
    return (
      <AppShell title="شاشة عامل التوصيل" showSignOut backTo={null}>
        <p className="text-sm text-muted-foreground">
          لا يوجد ملف عامل توصيل مرتبط بهذا الحساب. تواصل مع أحد المنسّقين.
        </p>
      </AppShell>
    );
  }

  const activeTasks = tasks.filter((t) => t.status !== "delivered").length;

  return (
    <AppShell
      title={`مرحبًا ${worker.name}`}
      subtitle={worker.area ? `منطقتك: ${worker.area}` : "لم تحدّد منطقتك بعد"}
      showSignOut
      showSettings
      backTo={null}
    >
      {editingProfile ? (
        <WorkerProfileForm worker={worker} onDone={() => setEditingProfile(false)} />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 w-full"
          onClick={() => setEditingProfile(true)}
        >
          <UserCog className="size-4" />
          تعديل ملفي
        </Button>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
        <button
          type="button"
          className={`rounded-xl py-2 text-sm font-bold ${tab === "tasks" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setTab("tasks")}
        >
          مهامي ({activeTasks})
        </button>
        <button
          type="button"
          className={`rounded-xl py-2 text-sm font-bold ${tab === "pool" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setTab("pool")}
        >
          متاحة للحجز ({pool.length})
        </button>
      </div>

      {tab === "tasks" ? (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              pending={advance.isPending}
              busy={advance.isPending && advance.variables?.postId === task.id}
              onAdvance={(next) => advance.mutate({ postId: task.id, next })}
            />
          ))}
          {tasks.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              لا توجد مهام لديك حاليًا. تصفّح المهام المتاحة للحجز.
            </li>
          ) : null}
        </ul>
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            className="mb-3 w-full"
            disabled={locate.isPending}
            onClick={() => locate.mutate()}
          >
            <LocateFixed className="size-4" />
            {myPosition ? "تحديث المسافة من موقعي" : "احسب المسافة من موقعي"}
          </Button>
          <ul className="space-y-3">
            {pool.map((item) => (
              <PoolCard
                key={item.id}
                item={item}
                myPosition={myPosition}
                pending={claim.isPending}
                busy={claim.isPending && claim.variables === item.id}
                onClaim={() => claim.mutate(item.id)}
              />
            ))}
            {pool.length === 0 ? (
              <li className="text-sm text-muted-foreground">لا توجد مهام متاحة في منطقتك الآن.</li>
            ) : null}
          </ul>
        </>
      )}
      {overlay}
    </AppShell>
  );
}

function PoolCard({
  item,
  myPosition,
  pending,
  busy,
  onClaim,
}: {
  item: PoolItem;
  myPosition: LatLng | null;
  pending: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const toPickup =
    myPosition && item.pickup_lat != null && item.pickup_lng != null
      ? formatApproxKm(distanceKm(myPosition, { lat: item.pickup_lat, lng: item.pickup_lng }))
      : null;
  const trip = formatApproxKm(item.approx_distance_km);

  return (
    <li className="card-surface p-4">
      <PostHeader
        food={item.food_description}
        quantity={item.quantity}
        badge={<StatusBadge status="posted" />}
      />

      {/* What a worker scans to decide: when, which neighborhood, how far. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <PoolStat icon={Clock} label="الاستلام">
          {formatPickupWindow(item.ready_time, item.available_until)}
        </PoolStat>
        <PoolStat icon={Navigation} label="التوصيل إلى">
          {item.delivery_area ?? "حي غير محدد"}
        </PoolStat>
        <PoolStat icon={RouteIcon} label="مسافة الرحلة">
          {trip ?? "غير متوفرة"}
        </PoolStat>
      </div>

      <div className="mt-3 space-y-1">
        <SourceFact
          name={item.restaurant_name}
          type={item.source_type}
          location={item.pickup_location}
          area={item.area}
        />
        {toPickup ? (
          <Fact icon={MapPin} muted>
            يبعد عنك {toPickup}
          </Fact>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">يظهر عنوان التوصيل الدقيق بعد الحجز.</p>
      <Button size="lg" className="mt-3 h-12 w-full" disabled={pending} onClick={onClaim}>
        <Hand className="size-5" />
        {busy ? "جارٍ الحجز..." : "احجز هذه المهمة"}
      </Button>
    </li>
  );
}

function PoolStat({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/60 p-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold leading-snug">{children}</p>
    </div>
  );
}

function TaskCard({
  task,
  pending,
  busy,
  onAdvance,
}: {
  task: Task;
  pending: boolean;
  busy: boolean;
  onAdvance: (next: "picked_up" | "delivered") => void;
}) {
  const pickupMap = mapsLink(task.pickup_lat, task.pickup_lng);
  const deliveryMap = task.is_confidential ? null : mapsLink(task.delivery_lat, task.delivery_lng);

  return (
    <li className="card-surface p-4">
      <PostHeader
        food={task.food_description}
        quantity={task.quantity}
        badge={<StatusBadge status={task.status as Status} />}
      />
      <div className="mt-3 space-y-1">
        <PickupWindowFact ready={task.ready_time} until={task.available_until} />
        <Fact icon={MapPin}>
          <span className="font-bold">{task.restaurant_name}</span>
          {task.source_type ? (
            <span className="text-muted-foreground"> · {SOURCE_TYPE_LABEL[task.source_type]}</span>
          ) : null}
          <span className="block">
            {task.pickup_location}
            {pickupMap ? <MapLink href={pickupMap} /> : null}
          </span>
        </Fact>
        {task.delivery_destination ? (
          <Fact icon={Navigation}>
            <span className="text-muted-foreground">
              {task.is_confidential ? "نقطة اللقاء" : "عنوان التوصيل"}:{" "}
            </span>
            {task.delivery_destination}
            {deliveryMap ? <MapLink href={deliveryMap} /> : null}
          </Fact>
        ) : null}
      </div>
      {task.is_confidential ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
          <ShieldCheck className="size-3.5" /> حالة سرّية — التسليم في نقطة اللقاء فقط
        </p>
      ) : null}

      {task.status === "assigned" ? (
        <Button
          size="lg"
          className="mt-4 h-14 w-full text-base"
          disabled={pending}
          onClick={() => onAdvance("picked_up")}
        >
          {busy ? "جارٍ التسجيل..." : "استلمت الطعام"}
        </Button>
      ) : null}
      {task.status === "picked_up" ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            استُلم {formatTime(task.picked_up_at)}
          </p>
          <Button
            size="lg"
            className="mt-2 h-14 w-full text-base"
            disabled={pending}
            onClick={() => onAdvance("delivered")}
          >
            {busy ? "جارٍ التسجيل..." : "تم التوصيل"}
          </Button>
        </>
      ) : null}
      {task.status === "delivered" ? (
        <p className="mt-3 text-sm font-bold text-primary">
          تم التوصيل {formatTime(task.delivered_at)} — شكرًا لك
        </p>
      ) : null}
    </li>
  );
}

function MapLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="فتح في الخريطة"
      className="ms-1 inline-flex shrink-0 items-center align-middle text-primary"
    >
      <ExternalLink className="size-4" />
    </a>
  );
}

function WorkerProfileForm({ worker, onDone }: { worker: DeliveryWorker; onDone: () => void }) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async (fd: FormData) => {
      const text = (key: string) => String(fd.get(key) ?? "").trim();
      const { error } = await supabase
        .from("delivery_workers")
        .update({ name: text("name"), phone: text("phone") || null, area: text("area") || null })
        .eq("id", worker.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الملف");
      queryClient.invalidateQueries({ queryKey: ["my-worker"] });
      queryClient.invalidateQueries({ queryKey: ["worker-pool"] });
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر الحفظ")),
  });

  return (
    <form
      className="card-surface mb-4 space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(new FormData(e.currentTarget));
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="worker-name">الاسم</Label>
        <Input id="worker-name" name="name" required minLength={2} defaultValue={worker.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="worker-phone">رقم الجوال (اختياري)</Label>
        <Input
          id="worker-phone"
          name="phone"
          inputMode="tel"
          dir="ltr"
          className="text-start"
          defaultValue={worker.phone ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="worker-area">المنطقة</Label>
        <Input id="worker-area" name="area" required defaultValue={worker.area ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={save.isPending}>
          حفظ
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onDone}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
