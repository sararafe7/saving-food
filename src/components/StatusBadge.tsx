import { CircleCheck, Megaphone, Package, UserCheck, type LucideIcon } from "lucide-react";

import { STATUS_LABEL, type Status } from "@/lib/pilot";
import { cn } from "@/lib/utils";

// The one place status colours are defined — every screen renders status through this badge.
const styles: Record<Status, { className: string; icon: LucideIcon }> = {
  posted: { className: "bg-status-posted text-status-posted-foreground", icon: Megaphone },
  assigned: { className: "bg-status-assigned text-status-assigned-foreground", icon: UserCheck },
  picked_up: { className: "bg-status-picked text-status-picked-foreground", icon: Package },
  delivered: {
    className: "bg-status-delivered text-status-delivered-foreground",
    icon: CircleCheck,
  },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { className: colors, icon: Icon } = styles[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold",
        colors,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
