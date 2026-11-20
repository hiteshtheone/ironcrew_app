import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

const SECTIONS = [
  {
    title: "What we store",
    body: "An account stores your email and password with our auth provider. Your profile stores your name, role, and timezone. Clients can also store a phone number, date of birth, goals, and workout logs (exercises, loads, reps, time, distance, and heart rate). Trainers store a business name and bio, plus the client records they create.",
  },
  {
    title: "Who can see it",
    body: "You can see your own account. A trainer can see the clients they coach, including those clients' goals and workout logs. Another trainer cannot. SEMA does not sell personal information and does not show ads.",
  },
  {
    title: "This release is free",
    body: "There is no subscription, payment, or entitlement check in this release. Trainers invite clients, and anyone can create an account. Billing is not part of the product yet.",
  },
  {
    title: "What is not in the product yet",
    body: "The database can hold body measurements and coach notes, and exercises can hold a video link, tempo, and RPE. Those are not shown or edited in this release. Training-day picks are not collected, because they are not used to place workouts on the calendar. Messages, push notifications, and a native app are not part of this release.",
  },
  {
    title: "Export and deletion",
    body: "Settings has Download my data, which saves a JSON file of the profile, programs, goals, and workout logs this login holds. Delete account removes that login. A trainer who still has clients, assigned plans, or logged sessions on their library is asked to remove those clients first, so a client's plan is not left pointing at a deleted login. Deleting a client account removes that client from their trainer's roster.",
  },
  {
    title: "Where it lives",
    body: "The app is hosted on Vercel. Accounts and the database are hosted on Supabase. The running app uses the publishable key. The database password is only for migrations and seeding, and it does not belong in git.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This policy covers SEMA. Training risks are in the{" "}
        <Link href="/terms" className="font-medium underline underline-offset-2">
          Terms and Conditions
        </Link>
        .
      </p>
      <div className="mt-10 flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
