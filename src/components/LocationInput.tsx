import { LocateFixed } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentPosition, formatCoords, parseCoords, type LatLng } from "@/lib/pilot";

/**
 * Optional map position: paste "lat, lng" or a map link, or use the device location.
 * Read the submitted value with readLocation(formData, name).
 */
export function LocationInput({
  id,
  name = "location",
  label = "الموقع على الخريطة (اختياري)",
  hint,
  defaultValue,
}: {
  id: string;
  name?: string;
  label?: string;
  hint?: string;
  defaultValue?: LatLng | null;
}) {
  const [value, setValue] = useState(
    defaultValue ? formatCoords(defaultValue.lat, defaultValue.lng) : "",
  );
  const [locating, setLocating] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          dir="ltr"
          className="text-start"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="24.71234, 46.67512"
        />
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          disabled={locating}
          onClick={async () => {
            setLocating(true);
            try {
              const pos = await currentPosition();
              setValue(formatCoords(pos.lat, pos.lng));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "تعذّر تحديد الموقع");
            } finally {
              setLocating(false);
            }
          }}
        >
          <LocateFixed className="size-4" />
          موقعي
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {hint ??
          "الصق الإحداثيات أو رابط خرائط يحتوي عليها، أو اضغط «موقعي». تُستخدم لحساب المسافة التقريبية."}
      </p>
    </div>
  );
}

/** undefined = field left empty; throws if something was typed but isn't a position. */
export function readLocation(fd: FormData, name = "location"): LatLng | undefined {
  const raw = String(fd.get(name) ?? "").trim();
  if (!raw) return undefined;
  const coords = parseCoords(raw);
  if (!coords) throw new Error("تعذّر قراءة الموقع — الصق الإحداثيات بصيغة: 24.71, 46.67");
  return coords;
}
