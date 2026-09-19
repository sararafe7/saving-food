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
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
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
  formatTime,
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
      toast.success("تم حجز المهمة — تجدها في «مهامي»");
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
      toast.success(vars.next === "picked_up" ? "تم تسجيل الاستلام" : "تم تسجيل التوصيل");
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
                onClaim={() => claim.mutate(item.id)}
              />
            ))}
            {pool.length === 0 ? (
              <li className="text-sm text-muted-foreground">لا توجد مهام متاحة في منطقتك الآن.</li>
            ) : null}
          </ul>
        </>
      )}
    </AppShell>
  );
}

function PoolCard({
  item,
  myPosition,
  pending,
  onClaim,
}: {
  item: PoolItem;
  myPosition: LatLng | null;
  pending: boolean;
  onClaim: () => void;
}) {
  const toPickup =
    myPosition && item.pickup_lat != null && item.pickup_lng != null
      ? formatApproxKm(distanceKm(myPosition, { lat: item.pickup_lat, lng: item.pickup_lng }))
      : null;
  const trip = formatApproxKm(item.approx_distance_km);

  return (
    <li className="card-surface p-4">
      <p className="font-bold leading-snug">{item.food_description}</p>
      <p className="mt-1 text-sm text-muted-foreground">{item.quantity}</p>
      <p className="mt-2 flex items-center gap-2 text-sm">
        <MapPin className="size-4 shrink-0 text-primary" />
        الاستلام: {item.restaurant_name} — {item.pickup_location}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm">
        <Clock className="size-4 shrink-0 text-primary" />
        جاهز {formatTime(item.ready_time)}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm">
        <Navigation className="size-4 shrink-0 text-primary" />
        التوصيل إلى: {item.delivery_area ?? "حي غير محدد"}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <RouteIcon className="size-4 shrink-0" />
        {trip ? `مسافة الرحلة ${trip}` : "مسافة الرحلة غير متوفرة"}
        {toPickup ? ` · تبعد عنك ${toPickup}` : ""}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">يظهر العنوان الدقيق بعد الحجز.</p>
      <Button size="lg" className="mt-3 h-12 w-full" disabled={pending} onClick={onClaim}>
        <Hand className="size-5" />
        احجز هذه المهمة
      </Button>
    </li>
  );
}

function TaskCard({
  task,
  pending,
  onAdvance,
}: {
  task: Task;
  pending: boolean;
  onAdvance: (next: "picked_up" | "delivered") => void;
}) {
  const pickupMap = mapsLink(task.pickup_lat, task.pickup_lng);
  const deliveryMap = task.is_confidential ? null : mapsLink(task.delivery_lat, task.delivery_lng);

  return (
    <li className="card-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold leading-snug">{task.food_description}</p>
        <StatusBadge status={task.status as Status} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{task.quantity}</p>
      <p className="mt-2 flex items-center gap-2 text-sm">
        <MapPin className="size-4 shrink-0 text-primary" />
        الاستلام: {task.restaurant_name} — {task.pickup_location}
        {pickupMap ? <MapLink href={pickupMap} /> : null}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm">
        <Clock className="size-4 shrink-0 text-primary" />
        جاهز {formatTime(task.ready_time)}
      </p>
      {task.delivery_destination ? (
        <p className="mt-1 flex items-center gap-2 text-sm">
          <Navigation className="size-4 shrink-0 text-primary" />
          {task.is_confidential ? "نقطة اللقاء" : "عنوان التوصيل"}: {task.delivery_destination}
          {deliveryMap ? <MapLink href={deliveryMap} /> : null}
        </p>
      ) : null}
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
          استلمت الطعام
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
            تم التوصيل
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
      className="inline-flex shrink-0 items-center text-primary"
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
