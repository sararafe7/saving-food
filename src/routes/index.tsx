import { createFileRoute, Link } from "@tanstack/react-router";
import { Store, ClipboardList, Bike, ShieldCheck } from "lucide-react";

import { APP_NAME } from "@/lib/pilot";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تنسيق فائض الطعام | إنقاذ الطعام وتوصيله للأسر" },
      {
        name: "description",
        content:
          "منصة تربط مصادر الطعام بالمنسّقين وعمّال التوصيل لإنقاذ فائض الطعام وتوصيله للأسر المستفيدة بخصوصية تامة.",
      },
      { property: "og:title", content: "تنسيق فائض الطعام" },
      {
        property: "og:description",
        content: "من مصدر الطعام إلى الأسرة: نشر الفائض، إسناده لعامل توصيل، ثم الاستلام والتوصيل.",
      },
    ],
  }),
  component: Home,
});

const cards = [
  { icon: Store, title: "مصادر الطعام", desc: "مطاعم ومخابز وبقالات تنشر الفائض المتوفر" },
  { icon: ClipboardList, title: "المنسّقون", desc: "يوزّعون الفائض على الأسر ويديرون الحسابات" },
  { icon: Bike, title: "عمّال التوصيل", desc: "يحجزون المهام المتاحة أو يستلمون ما يُسند إليهم" },
  { icon: ShieldCheck, title: "الحالات الحساسة", desc: "نقطة لقاء عامة بدل العنوان الدقيق" },
];

function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="mt-4 text-3xl font-bold leading-tight">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          إنقاذ فائض الطعام وتوصيله للأسر المستفيدة، مع حماية كاملة لبيانات الأسر.
        </p>
      </div>

      <div className="space-y-3">
        {cards.map((card) => (
          <div key={card.title} className="card-surface flex items-center gap-4 p-4">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <card.icon className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold">{card.title}</span>
              <span className="block text-sm text-muted-foreground">{card.desc}</span>
            </span>
          </div>
        ))}
      </div>

      <Link
        to="/auth"
        className="mt-8 inline-flex h-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground"
      >
        الدخول إلى حسابك
      </Link>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        أول حساب يُسجَّل يصبح منسّقًا تلقائيًا، وبقية الحسابات تُفعَّل بعد موافقة أحد المنسّقين.
      </p>
    </div>
  );
}
