import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { LocationInput, readLocation } from "@/components/LocationInput";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  SOURCE_TYPE_LABEL,
  errorMessage,
  formatTime,
  toIsoFromTime,
  type FoodSource,
  type Status,
} from "@/lib/pilot";

export const Route = createFileRoute("/_authenticated/source")({
  head: () => ({
    meta: [
      { title: "شاشة مصدر الطعام | تنسيق فائض الطعام" },
      {
        name: "description",
        content: "أبلغ عن فائض الطعام المتوفر عندك بخطوة واحدة، وتابع حالة كل إعلان حتى التوصيل.",
      },
      { property: "og:title", content: "شاشة مصدر الطعام" },
      {
        property: "og:description",
        content: "نموذج سريع للإبلاغ عن فائض الطعام ومتابعة حالته.",
      },
    ],
  }),
  component: SourcePage,
  errorComponent: () => (
    <AppShell title="شاشة مصدر الطعام">
      <p className="text-sm text-muted-foreground">حدث خطأ. حدّث الصفحة وحاول مرة أخرى.</p>
    </AppShell>
  ),
});

const SOURCE_COLUMNS = "id,name,type,address,phone,area,lat,lng,active";

function SourcePage() {
  const [open, setOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const queryClient = useQueryClient();

  const { data: source, isPending } = useQuery({
    queryKey: ["my-source"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("food_sources")
        .select(SOURCE_COLUMNS)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as FoodSource | null) ?? null;
    },
  });

  // Only food and status columns — sources never receive family or destination data.
  const { data: posts = [] } = useQuery({
    queryKey: ["source-posts", source?.id],
    enabled: !!source,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_source_posts");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (form: {
      food_description: string;
      quantity: string;
      ready_time: string;
      pickup_location: string;
    }) => {
      const { error } = await supabase.rpc("create_surplus_post", {
        _food_description: form.food_description,
        _quantity: form.quantity,
        _ready_time: toIsoFromTime(form.ready_time),
        _pickup_location: form.pickup_location,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم نشر الفائض");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["source-posts"] });
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر النشر، حاول مرة أخرى")),
  });

  if (isPending) {
    return (
      <AppShell title="شاشة مصدر الطعام" showSignOut backTo={null}>
        <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
      </AppShell>
    );
  }

  if (!source) {
    return (
      <AppShell title="شاشة مصدر الطعام" showSignOut backTo={null}>
        <p className="text-sm text-muted-foreground">
          لا يوجد ملف مصدر طعام مرتبط بهذا الحساب. تواصل مع أحد المنسّقين.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={source.name}
      subtitle={`${SOURCE_TYPE_LABEL[source.type]} · ${source.address}`}
      showSignOut
      backTo={null}
    >
      {!source.phone || !source.area ? (
        <p className="mb-4 rounded-xl bg-accent/30 p-3 text-sm">
          أكمل رقم الجوال والمنطقة في ملفك ليظهر فائضك لعمّال التوصيل في منطقتك.
        </p>
      ) : null}

      {editingProfile ? (
        <SourceProfileForm source={source} onDone={() => setEditingProfile(false)} />
      ) : open ? (
        <form
          className="card-surface space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            create.mutate({
              food_description: String(fd.get("food_description") ?? ""),
              quantity: String(fd.get("quantity") ?? ""),
              ready_time: String(fd.get("ready_time") ?? ""),
              pickup_location: String(fd.get("pickup_location") ?? ""),
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="food_description">وصف الطعام</Label>
            <Textarea
              id="food_description"
              name="food_description"
              required
              rows={2}
              placeholder="مثال: 20 حصة أرز مع دجاج"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">الكمية (تقديرية)</Label>
            <Input id="quantity" name="quantity" required placeholder="مثال: 20 حصة" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ready_time">وقت الجهوزية للاستلام</Label>
            <Input id="ready_time" name="ready_time" type="time" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pickup_location">موقع الاستلام</Label>
            <Input
              id="pickup_location"
              name="pickup_location"
              required
              defaultValue={source.address}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="lg" className="flex-1" disabled={create.isPending}>
              {create.isPending ? "جارٍ النشر..." : "نشر الفائض"}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      ) : (
        <>
          <Button size="lg" className="h-16 w-full text-lg" onClick={() => setOpen(true)}>
            <Plus className="size-6" />
            الإبلاغ عن فائض متوفر
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setEditingProfile(true)}
          >
            <UserCog className="size-4" />
            تعديل ملف المصدر
          </Button>
        </>
      )}

      <h2 className="mb-3 mt-8 text-sm font-bold text-muted-foreground">إعلاناتي</h2>
      <ul className="space-y-3">
        {posts.map((post) => (
          <li key={post.id} className="card-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold leading-snug">{post.food_description}</p>
              <StatusBadge status={post.status as Status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {post.quantity} · جاهز {formatTime(post.ready_time)}
            </p>
            {post.picked_up_at ? (
              <p className="mt-1 text-xs text-muted-foreground">
                استُلم {formatTime(post.picked_up_at)}
                {post.delivered_at ? ` · وُصّل ${formatTime(post.delivered_at)}` : ""}
              </p>
            ) : null}
          </li>
        ))}
        {posts.length === 0 ? (
          <li className="text-sm text-muted-foreground">لا توجد إعلانات بعد.</li>
        ) : null}
      </ul>
    </AppShell>
  );
}

function SourceProfileForm({ source, onDone }: { source: FoodSource; onDone: () => void }) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async (fd: FormData) => {
      const location = readLocation(fd);
      const text = (key: string) => String(fd.get(key) ?? "").trim();
      const { error } = await supabase
        .from("food_sources")
        .update({
          name: text("name"),
          address: text("address"),
          phone: text("phone") || null,
          area: text("area") || null,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
        })
        .eq("id", source.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الملف");
      queryClient.invalidateQueries({ queryKey: ["my-source"] });
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر الحفظ")),
  });

  return (
    <form
      className="card-surface space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(new FormData(e.currentTarget));
      }}
    >
      <p className="text-sm font-bold">ملف المصدر</p>
      <div className="space-y-2">
        <Label htmlFor="profile-name">اسم المصدر</Label>
        <Input id="profile-name" name="name" required minLength={2} defaultValue={source.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-address">عنوان الاستلام</Label>
        <Input id="profile-address" name="address" required defaultValue={source.address} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-phone">رقم الجوال</Label>
        <Input
          id="profile-phone"
          name="phone"
          inputMode="tel"
          dir="ltr"
          className="text-start"
          required
          defaultValue={source.phone ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-area">المنطقة</Label>
        <Input id="profile-area" name="area" required defaultValue={source.area ?? ""} />
      </div>
      <LocationInput
        id="profile-location"
        defaultValue={
          source.lat != null && source.lng != null ? { lat: source.lat, lng: source.lng } : null
        }
      />
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
