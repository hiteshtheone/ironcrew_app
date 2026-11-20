import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and Conditions",
};

const SECTIONS = [
  {
    title: "You must be fit to train",
    body: "You are responsible for deciding that you are healthy enough for the workouts and for following the plan as written, including rest and the loads you choose.",
  },
  {
    title: "Consult a doctor",
    body: "Talk to a physician before you start or change training, especially if you have a medical condition, injury, are pregnant, or have not exercised recently. Stop and get medical help if you feel pain, dizziness, chest pain, or unusual shortness of breath.",
  },
  {
    title: "Not medical advice",
    body: "Plans and workouts here are general fitness information. They are not a diagnosis, treatment, or a substitute for a qualified professional.",
  },
  {
    title: "Injuries",
    body: "Exercise has inherent risks. You accept those risks. Makers of this app are not responsible for injury, illness, or other harm that results from workouts or from following a plan.",
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-bold tracking-tight">Terms and Conditions</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        These terms cover training with SEMA. By continuing, you agree to them.
        How account data is stored, exported, and deleted is in the{" "}
        <Link href="/privacy" className="font-medium underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
      <ol className="mt-10 flex list-decimal flex-col gap-8 pl-5">
        {SECTIONS.map((section) => (
          <li key={section.title} className="pl-1">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
