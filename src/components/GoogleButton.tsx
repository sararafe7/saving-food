import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { authErrorMessage } from "@/lib/pilot";

/**
 * Google only hands back a name and an email, so a first-time Google account
 * lands on /auth with no role: the database trigger has nothing to build a
 * profile from. /pending then asks for the role and the role's fields, exactly
 * like the e-mail sign-up form, and the account waits for approval as usual.
 *
 * Requires the Google provider to be enabled in the Supabase dashboard, with
 * this app's origin and <project>.supabase.co/auth/v1/callback registered in
 * the Google Cloud OAuth client.
 */
export function GoogleButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await lovable.auth.signInWithOAuth("google", {
          redirect_uri: `${window.location.origin}/auth`,
        });
        if (result.error) {
          setPending(false);
          toast.error(authErrorMessage(result.error, "تعذّر الدخول عبر Google"));
          return;
        }
        // Either the browser leaves for Google, or the session is already set
        // and /auth routes the user onward.
        if (!result.redirected) window.location.href = "/auth";
      }}
    >
      <GoogleMark />
      {label}
    </Button>
  );
}

function GoogleMark() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84a10.13 10.13 0 0 1-4.4 6.65v5.52h7.12c4.16-3.83 6.56-9.47 6.56-16.18Z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.12-5.52c-1.97 1.32-4.49 2.1-7.44 2.1-5.73 0-10.58-3.87-12.31-9.07H4.24v5.7A22 22 0 0 0 24 46Z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.24A22 22 0 0 0 2 24c0 3.55.85 6.91 2.24 9.88l7.45-5.7Z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.24 14.12l7.45 5.7c1.73-5.2 6.58-9.07 12.31-9.07Z"
      />
    </svg>
  );
}
