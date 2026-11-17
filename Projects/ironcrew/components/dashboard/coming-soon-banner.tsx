import { Apple, Mic, Sparkles, type LucideIcon } from "lucide-react";

const features: { label: string; icon: LucideIcon }[] = [
  { label: "AI", icon: Sparkles },
  { label: "Voice", icon: Mic },
  { label: "Nutrition", icon: Apple },
];

/** Static preview of features that are not available yet. Shown on both dashboard homes. */
export function ComingSoonBanner() {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Coming soon">
      <h2 className="text-lg font-bold">Coming soon</h2>
      <p className="mt-1 text-sm text-slate-500">AI coaching, voice, and nutrition tracking are on the way.</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {features.map(({ label, icon: Icon }) => (
          <li key={label} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
