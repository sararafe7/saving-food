import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Confirmation = { title: string; detail?: string };

const SHOW_MS = 2200;

/**
 * A short full-screen checkmark after an important action (posting, claiming,
 * picked up, delivered), so it's unmistakable that it worked. Tap to dismiss early.
 */
export function useSuccessOverlay() {
  const [current, setCurrent] = useState<Confirmation | null>(null);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setCurrent(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [current]);

  const confirm = useCallback((title: string, detail?: string) => {
    setCurrent(detail ? { title, detail } : { title });
  }, []);

  const overlay = current ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6 animate-in fade-in duration-150"
      onClick={() => setCurrent(null)}
    >
      <div className="card-surface w-full max-w-xs p-6 text-center shadow-lg animate-in zoom-in-90 duration-200">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-status-delivered text-status-delivered-foreground">
          <Check className="size-9" strokeWidth={3} aria-hidden />
        </span>
        <p className="mt-4 text-lg font-bold">{current.title}</p>
        {current.detail ? (
          <p className="mt-1 text-sm text-muted-foreground">{current.detail}</p>
        ) : null}
      </div>
    </div>
  ) : null;

  return { confirm, overlay };
}
