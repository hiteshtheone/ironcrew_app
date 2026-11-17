import { Apple, Mic, Sparkles, type LucideIcon } from "lucide-react";

const features: { label: string; icon: LucideIcon }[] = [
  { label: "AI", icon: Sparkles },
  { label: "Voice", icon: Mic },
  { label: "Nutrition", icon: Apple },
];

/** One-line preview of features that are not available yet. Shown on both dashboard homes. */
export function ComingSoonBanner() {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
      <span className="font-medium text-slate-700">Coming soon</span>
      {features.map(({ label, icon: Icon }) => (
        <span
          key={label}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 font-medium text-slate-700 shadow-sm"
        >
          <Icon className="size-4 text-emerald-600" aria-hidden="true" />
          {label}
        </span>
      ))}
    </p>
  );
}
