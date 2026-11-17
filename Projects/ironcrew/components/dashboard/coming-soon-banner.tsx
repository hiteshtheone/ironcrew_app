import { Apple, Mic, Sparkles, type LucideIcon } from "lucide-react";

const features: { label: string; icon: LucideIcon }[] = [
  { label: "AI", icon: Sparkles },
  { label: "Voice", icon: Mic },
  { label: "Nutrition", icon: Apple },
];

/** Icon-only preview of features that are not available yet. Shown on both dashboard homes. */
export function ComingSoonBanner() {
  return (
    <ul className="mt-4 flex items-center gap-2" aria-label="Coming soon">
      {features.map(({ label, icon: Icon }) => (
        <li key={label}>
          <span
            role="img"
            title={`${label} coming soon`}
            aria-label={`${label} coming soon`}
            className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-emerald-600 shadow-sm"
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </li>
      ))}
    </ul>
  );
}
