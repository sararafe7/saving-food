import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { LocationInput, readLocation } from "@/components/LocationInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { FAMILY_COLUMNS, errorMessage, type Family, type LatLng } from "@/lib/pilot";

export const Route = createFileRoute("/_authenticated/families")({
  head: () => ({
    meta: [
      { title: "الأسر المستفيدة | تنسيق فائض الطعام" },
      {
        name: "description",
        content:
          "قائمة الأسر المستفيدة المشتركة بين المنسّقين: إضافة وتعديل وحذف، مع تحديد الحالات السرّية.",
      },
      { property: "og:title", content: "الأسر المستفيدة" },
      {
        property: "og:description",
        content: "قائمة يراها المنسّقون فقط، ولا تظهر لمصادر الطعام ولا لعمّال التوصيل.",
      },
    ],
  }),
  component: FamiliesPage,
  errorComponent: () => (
    <AppShell title="الأسر المستفيدة" backTo="/coordinator">
      <p className="text-sm text-muted-foreground">حدث خطأ. حدّث الصفحة وحاول مرة أخرى.</p>
    </AppShell>
  ),
});

type FormValues = {
  name: string;
  address: string;
  contact_phone: string;
  notes: string;
  neighborhood: string;
  location: LatLng | undefined;
  is_sensitive: boolean;
};

function FamiliesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Family | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data: families = [] } = useQuery({
    queryKey: ["families"],
    queryFn: async () => {
      const { data, error } = await supabase.from("families").select(FAMILY_COLUMNS).order("name");
      if (error) throw error;
      return data as Family[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["families"] });

  const save = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: FormValues }) => {
      const payload = {
        name: values.name,
        address: values.address,
        contact_phone: values.contact_phone || null,
        notes: values.notes || null,
        neighborhood: values.neighborhood || null,
        lat: values.location?.lat ?? null,
        lng: values.location?.lng ?? null,
        is_sensitive: values.is_sensitive,
      };
      if (id) {
        const { error } = await supabase.from("families").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("families").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "تعذّر الحفظ")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("families").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الأسرة");
      invalidate();
    },
    onError: () => toast.error("تعذّر الحذف"),
  });

  return (
    <AppShell
      title="الأسر المستفيدة"
      subtitle="مشتركة بين المنسّقين — لا تظهر لغيرهم"
      showSignOut
      backTo="/coordinator"
    >
      {formOpen || editing ? (
        <FamilyForm
          initial={editing}
          pending={save.isPending}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={(values) => save.mutate({ id: editing?.id ?? null, values })}
        />
      ) : (
        <Button size="lg" className="h-14 w-full text-base" onClick={() => setFormOpen(true)}>
          <Plus className="size-5" />
          إضافة أسرة
        </Button>
      )}

      <ul className="mt-6 space-y-3">
        {families.map((family) => (
          <li key={family.id} className="card-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold leading-snug">{family.name}</p>
              {family.is_sensitive ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs font-bold text-secondary-foreground">
                  <ShieldCheck className="size-3.5" /> سرّية
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {family.address}
              {family.neighborhood ? ` · ${family.neighborhood}` : ""}
            </p>
            {family.contact_phone ? (
              <p className="mt-1 text-sm text-muted-foreground">{family.contact_phone}</p>
            ) : null}
            {family.notes ? <p className="mt-2 text-sm">{family.notes}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(family)}>
                <Pencil className="size-4" /> تعديل
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`حذف ${family.name} من قائمتك؟`)) remove.mutate(family.id);
                }}
              >
                <Trash2 className="size-4" /> حذف
              </Button>
            </div>
          </li>
        ))}
        {families.length === 0 ? (
          <li className="text-sm text-muted-foreground">لم تُضف أي أسرة بعد.</li>
        ) : null}
      </ul>
    </AppShell>
  );
}

function FamilyForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: Family | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [sensitive, setSensitive] = useState(initial?.is_sensitive ?? false);

  return (
    <form
      className="card-surface space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        let location: LatLng | undefined;
        try {
          location = readLocation(fd);
        } catch (error) {
          toast.error(errorMessage(error, "تعذّر قراءة الموقع"));
          return;
        }
        onSubmit({
          name: String(fd.get("name") ?? "").trim(),
          address: String(fd.get("address") ?? "").trim(),
          contact_phone: String(fd.get("contact_phone") ?? "").trim(),
          notes: String(fd.get("notes") ?? "").trim(),
          neighborhood: String(fd.get("neighborhood") ?? "").trim(),
          location,
          is_sensitive: sensitive,
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name">اسم الأسرة</Label>
        <Input id="name" name="name" required defaultValue={initial?.name ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">العنوان / الموقع</Label>
        <Input id="address" name="address" required defaultValue={initial?.address ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="neighborhood">الحي (منطقة عامة)</Label>
        <Input
          id="neighborhood"
          name="neighborhood"
          defaultValue={initial?.neighborhood ?? ""}
          placeholder="مثال: حي النزهة"
        />
        <p className="text-xs text-muted-foreground">
          يراه عمّال التوصيل قبل حجز المهمة بدل العنوان الدقيق. اكتب اسم الحي فقط.
        </p>
      </div>
      <LocationInput
        id="family-location"
        hint="الصق الإحداثيات أو رابط خرائط يحتوي عليها. لا تُعرض لعامل التوصيل قبل الحجز، وتُستخدم لحساب المسافة التقريبية فقط."
        defaultValue={
          initial?.lat != null && initial.lng != null
            ? { lat: initial.lat, lng: initial.lng }
            : null
        }
      />
      <div className="space-y-2">
        <Label htmlFor="contact_phone">رقم التواصل (اختياري)</Label>
        <Input
          id="contact_phone"
          name="contact_phone"
          inputMode="tel"
          defaultValue={initial?.contact_phone ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">ملاحظات (عدد الأفراد، قيود غذائية...)</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
      </div>
      <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
        <div>
          <p className="text-sm font-bold">حالة حسّاسة / سرّية</p>
          <p className="text-xs text-muted-foreground">
            تُسند مباشرة لعامل محدد، ويرى نقطة لقاء عامة بدل الاسم والعنوان.
          </p>
        </div>
        <Switch checked={sensitive} onCheckedChange={setSensitive} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          حفظ
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
