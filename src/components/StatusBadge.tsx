import { STATUS_LABEL, type Status } from "@/lib/pilot";
import { cn } from "@/lib/utils";

const styles: Record<Status, string> = {
  posted: "bg-status-posted text-status-posted-foreground",
  assigned: "bg-status-assigned text-status-assigned-foreground",
  picked_up: "bg-status-picked text-status-picked-foreground",
  delivered: "bg-status-delivered text-status-delivered-foreground",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold",
        styles[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
