import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const credentials = {
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(2).max(120),
};

const accountSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("coordinator"),
    ...credentials,
    org: z.string().max(160).optional(),
  }),
  z.object({
    role: z.literal("source"),
    ...credentials,
    type: z.enum(["restaurant", "bakery", "grocery", "other"]),
    address: z.string().min(2).max(300),
    phone: z.string().max(40).optional(),
    area: z.string().max(120).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }),
  z.object({
    role: z.literal("worker"),
    ...credentials,
    phone: z.string().max(40).optional(),
    area: z.string().max(120).optional(),
  }),
]);

/**
 * Coordinator-only: creates a login of any role, approved immediately.
 * The on_auth_user_created trigger builds the role and profile from the metadata;
 * app_metadata.pre_approved can only be set here, with the service role.
 */
export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => accountSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isCoordinator, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "coordinator",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isCoordinator) throw new Error("هذه الصلاحية للمنسّقين فقط");

    const { email, password, ...profile } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: profile,
      app_metadata: { pre_approved: true },
    });
    if (error || !created.user) throw new Error(error?.message ?? "تعذّر إنشاء الحساب");

    return { ok: true };
  });
