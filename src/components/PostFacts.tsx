import { Clock, Store, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { SOURCE_TYPE_LABEL, formatPickupWindow, type SourceType } from "@/lib/pilot";
import { cn } from "@/lib/utils";

/** One icon + text line on a report card. */
export function Fact({
  icon: Icon,
  children,
  muted,
}: {
  icon: LucideIcon;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <p className={cn("flex items-start gap-2 text-sm", muted && "text-muted-foreground")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", !muted && "text-primary")} aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Food + quantity header shared by every report card, with the status (or other) badge. */
export function PostHeader({
  food,
  quantity,
  badge,
}: {
  food: string;
  quantity: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-bold leading-snug">{food}</p>
        <p className="mt-1 inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
          {quantity}
        </p>
      </div>
      {badge}
    </div>
  );
}

export function PickupWindowFact({ ready, until }: { ready: string; until: string | null }) {
  return (
    <Fact icon={Clock}>
      <span className="text-muted-foreground">الاستلام </span>
      <span className="font-bold">{formatPickupWindow(ready, until)}</span>
    </Fact>
  );
}

export function SourceFact({
  name,
  type,
  location,
  area,
}: {
  name: string;
  type: SourceType | null | undefined;
  location?: string | null;
  area?: string | null;
}) {
  return (
    <Fact icon={Store}>
      <span className="font-bold">{name}</span>
      {type ? <span className="text-muted-foreground"> · {SOURCE_TYPE_LABEL[type]}</span> : null}
      {location || area ? (
        <span className="block text-muted-foreground">
          {[location, area].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </Fact>
  );
}
