export const APP_NAME = "تنسيق فائض الطعام";

export type Status = "posted" | "assigned" | "picked_up" | "delivered";

export const STATUS_ORDER: Status[] = ["posted", "assigned", "picked_up", "delivered"];

export const STATUS_LABEL: Record<Status, string> = {
  posted: "منشور",
  assigned: "مُسند",
  picked_up: "تم الاستلام",
  delivered: "تم التوصيل",
};

export type SourceType = "restaurant" | "bakery" | "grocery" | "other";

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  restaurant: "مطعم",
  bakery: "مخبز",
  grocery: "بقالة وخضار",
  other: "أخرى",
};

export type AppRole = "coordinator" | "source" | "worker";

export const ROLE_LABEL: Record<AppRole, string> = {
  coordinator: "منسّق",
  source: "مصدر طعام",
  worker: "عامل توصيل",
};

export const ROLE_HOME: Record<AppRole, string> = {
  coordinator: "/coordinator",
  source: "/source",
  worker: "/worker",
};

export type FoodSource = {
  id: string;
  name: string;
  type: SourceType;
  address: string;
  phone: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
};

export type DeliveryWorker = {
  id: string;
  name: string;
  phone: string | null;
  area: string | null;
  active: boolean;
};

export type Family = {
  id: string;
  name: string;
  address: string;
  contact_phone: string | null;
  notes: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  is_sensitive: boolean;
  created_at: string;
};

export const FAMILY_COLUMNS =
  "id,name,address,contact_phone,notes,neighborhood,lat,lng,is_sensitive,created_at";

export type ClaimMode = "open" | "direct";

export type SurplusPost = {
  id: string;
  restaurant_name: string;
  food_description: string;
  quantity: string;
  ready_time: string;
  available_until: string;
  pickup_location: string;
  status: Status;
  source_id: string | null;
  family_id: string | null;
  worker_id: string | null;
  coordinator_id: string | null;
  delivery_destination: string | null;
  delivery_area: string | null;
  is_confidential: boolean;
  claim_mode: ClaimMode | null;
  area: string | null;
  created_at: string;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
};

export const POST_COLUMNS =
  "id,restaurant_name,food_description,quantity,ready_time,available_until,pickup_location,status,source_id,family_id,worker_id,coordinator_id,delivery_destination,delivery_area,is_confidential,claim_mode,area,created_at,assigned_at,picked_up_at,delivered_at";

export function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

export function toIsoFromTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  if (d.getTime() < Date.now() - 60_000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** The source's "available until" time, placed on the first moment after the ready time. */
export function toIsoAfter(value: string, afterIso: string) {
  const [h, m] = value.split(":").map(Number);
  const after = new Date(afterIso);
  const d = new Date(after);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  if (d.getTime() <= after.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function dayLabel(date: Date) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "غدًا";
  if (diff === -1) return "أمس";
  return date.toLocaleDateString("ar", { day: "numeric", month: "short" });
}

const timeFormat = new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit" });

/** "اليوم 3:30–4:30 م". Older reports without an end time get the default one-hour window. */
export function formatPickupWindow(readyIso: string, untilIso: string | null | undefined) {
  const start = new Date(readyIso);
  const end = untilIso ? new Date(untilIso) : new Date(start.getTime() + 3_600_000);
  return `${dayLabel(start)} ${timeFormat.formatRange(start, end)}`;
}

export type LatLng = { lat: number; lng: number };

/** Reads coordinates from "24.71, 46.67" or a map link containing them (e.g. .../@24.71,46.67,15z). */
export function parseCoords(text: string): LatLng | null {
  const match = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng };
}

export function formatCoords(lat: number | null, lng: number | null) {
  return lat == null || lng == null ? "" : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error("تعذّر تحديد موقعك — تأكد من السماح بالوصول للموقع")),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export function distanceKm(a: LatLng, b: LatLng) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** "~3.5 كم", rounded to the nearest half kilometre. */
export function formatApproxKm(km: number | null | undefined) {
  if (km == null) return null;
  const rounded = Math.max(0.5, Math.round(km * 2) / 2);
  return `~${rounded.toLocaleString("ar")} كم`;
}

export function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    // Database functions raise Arabic messages meant for the user.
    if (/[؀-ۿ]/.test(message)) return message;
  }
  return fallback;
}

/**
 * Supabase Auth answers in English. Without this everything collapsed into one
 * unhelpful "تعذّر إنشاء الحساب", so sign-up failures name their cause instead.
 * A trigger that raises inside the database always arrives as the opaque
 * "Database error saving new user" — its Arabic text never reaches the browser.
 */
export function authErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const code = "code" in error ? String((error as { code: unknown }).code ?? "") : "";
  const raw = "message" in error ? String((error as { message: unknown }).message ?? "") : "";
  if (/[؀-ۿ]/.test(raw)) return raw;
  const message = raw.toLowerCase();

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("already registered")
  ) {
    return "هذا البريد مسجّل بالفعل — ادخل من تبويب «دخول» أو استخدم بريدًا آخر";
  }
  if (
    code.startsWith("over_") ||
    message.includes("rate limit") ||
    message.includes("you can only request this after")
  ) {
    return "تم تجاوز عدد المحاولات المسموح بها — انتظر قليلًا ثم أعد المحاولة";
  }
  if (code === "weak_password" || message.includes("password should be")) {
    return "كلمة المرور ضعيفة — استخدم 8 أحرف على الأقل مع أرقام";
  }
  if (code === "signup_disabled" || message.includes("signups not allowed")) {
    return "التسجيل الذاتي موقوف حاليًا — تواصل مع أحد المنسّقين لإنشاء حسابك";
  }
  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return "البريد الإلكتروني غير صالح";
  }
  if (message.includes("database error")) {
    return "تعذّر إنشاء الحساب بسبب خطأ في قاعدة البيانات — تأكد من تشغيل ملفات الترحيل في Supabase";
  }
  if (message.includes("failed to fetch") || message.includes("networkerror")) {
    return "تعذّر الاتصال بالخادم — تحقّق من اتصالك بالإنترنت";
  }
  if (message.includes("missing supabase environment")) {
    return "إعدادات Supabase ناقصة في هذه النسخة من التطبيق";
  }
  return fallback;
}
