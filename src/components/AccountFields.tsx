import { useState } from "react";

import { LocationInput, readLocation } from "@/components/LocationInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABEL, SOURCE_TYPE_LABEL, type AppRole, type SourceType } from "@/lib/pilot";

export type AccountProfile =
  | { role: "coordinator"; name: string; org?: string }
  | {
      role: "source";
      name: string;
      type: SourceType;
      address: string;
      phone?: string;
      area?: string;
      lat?: number;
      lng?: number;
    }
  | { role: "worker"; name: string; phone?: string; area?: string };

export function RoleSelect({
  value,
  onChange,
}: {
  value: AppRole;
  onChange: (role: AppRole) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>نوع الحساب</Label>
      <Select value={value} onValueChange={(v) => onChange(v as AppRole)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["source", "worker", "coordinator"] as AppRole[]).map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABEL[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Profile fields for one role. Pair with readAccountProfile() on submit. */
export function AccountFields({ role, idPrefix = "acct" }: { role: AppRole; idPrefix?: string }) {
  const [type, setType] = useState<SourceType>("restaurant");
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={id("name")}>
          {role === "source" ? "اسم المصدر" : role === "worker" ? "الاسم" : "اسم المنسّق"}
        </Label>
        <Input id={id("name")} name="name" required minLength={2} maxLength={120} />
      </div>

      {role === "coordinator" ? (
        <div className="space-y-2">
          <Label htmlFor={id("org")}>الجهة (اختياري)</Label>
          <Input
            id={id("org")}
            name="org"
            maxLength={160}
            placeholder="مثال: لجنة المسجد الخيرية"
          />
        </div>
      ) : null}

      {role === "source" ? (
        <>
          <div className="space-y-2">
            <Label>نوع المصدر</Label>
            <input type="hidden" name="type" value={type} />
            <Select value={type} onValueChange={(v) => setType(v as SourceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_TYPE_LABEL) as SourceType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SOURCE_TYPE_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("address")}>عنوان الاستلام</Label>
            <Input
              id={id("address")}
              name="address"
              required
              minLength={2}
              maxLength={300}
              placeholder="مثال: شارع الملك فهد، حي النزهة"
            />
          </div>
        </>
      ) : null}

      {role !== "coordinator" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor={id("phone")}>رقم الجوال{role === "worker" ? " (اختياري)" : ""}</Label>
            <Input
              id={id("phone")}
              name="phone"
              inputMode="tel"
              dir="ltr"
              className="text-start"
              maxLength={40}
              required={role === "source"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("area")}>المنطقة</Label>
            <Input
              id={id("area")}
              name="area"
              required
              maxLength={120}
              placeholder="مثال: حي النزهة"
            />
            <p className="text-xs text-muted-foreground">
              {role === "worker"
                ? "ستظهر لك المهام المتاحة في هذه المنطقة."
                : "تُستخدم لعرض بلاغاتك لعمّال التوصيل في منطقتك."}
            </p>
          </div>
        </>
      ) : null}

      {role === "source" ? <LocationInput id={id("location")} /> : null}
    </>
  );
}

export function readAccountProfile(role: AppRole, fd: FormData): AccountProfile {
  const text = (key: string) => String(fd.get(key) ?? "").trim();
  const optional = (key: string) => text(key) || undefined;
  const name = text("name");

  if (role === "coordinator") return { role, name, ...opt("org", optional("org")) };
  if (role === "worker") {
    return { role, name, ...opt("phone", optional("phone")), ...opt("area", optional("area")) };
  }
  const location = readLocation(fd);
  return {
    role,
    name,
    type: (text("type") || "restaurant") as SourceType,
    address: text("address"),
    ...opt("phone", optional("phone")),
    ...opt("area", optional("area")),
    ...(location ? { lat: location.lat, lng: location.lng } : {}),
  };
}

// exactOptionalPropertyTypes: omit keys instead of setting them to undefined.
function opt<K extends string>(key: K, value: string | undefined) {
  return (value === undefined ? {} : { [key]: value }) as Partial<Record<K, string>>;
}
