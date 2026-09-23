import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Dumbbell,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: Activity, active: true },
  { label: "Clients", href: "#", icon: Users },
  { label: "Programs", href: "#", icon: Dumbbell },
  { label: "Calendar", href: "#", icon: CalendarDays },
  { label: "Messages", href: "#", icon: MessageSquare, badge: "3" },
];

const sessions = [
  { name: "Aarav Shah", workout: "Upper body strength", time: "08:00 AM", status: "Completed", initials: "AS", tone: "bg-orange-100 text-orange-700" },
  { name: "Priya Mehta", workout: "Lower body · Week 3", time: "10:30 AM", status: "In progress", initials: "PM", tone: "bg-violet-100 text-violet-700" },
  { name: "Rohan Kapoor", workout: "Full body conditioning", time: "04:00 PM", status: "Scheduled", initials: "RK", tone: "bg-sky-100 text-sky-700" },
];

const progress = [
  { name: "Priya Mehta", detail: "Workout consistency", value: "86%", change: "+12%", initials: "PM", tone: "bg-violet-100 text-violet-700" },
  { name: "Aarav Shah", detail: "Strength goal", value: "72%", change: "+8%", initials: "AS", tone: "bg-orange-100 text-orange-700" },
  { name: "Meera Iyer", detail: "Body weight goal", value: "64%", change: "+5%", initials: "MI", tone: "bg-emerald-100 text-emerald-700" },
];

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AuthenticatedDashboard />
    </Suspense>
  );
}

async function AuthenticatedDashboard() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <aside className="fixed inset-y-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">T</span>
          <span className="text-lg font-semibold tracking-tight">Trainer</span>
        </Link>

        <nav className="mt-10 space-y-1">
          {navigation.map(({ label, href, icon: Icon, active, badge }) => (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"}`}
            >
              <Icon className="size-[18px]" />
              <span>{label}</span>
              {badge && <span className="ml-auto rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-100 pt-4">
          <Link href="#" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950">
            <Settings className="size-[18px]" /> Settings
          </Link>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="grid size-9 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">HK</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Hitesh K.</p>
              <p className="truncate text-xs text-slate-500">Trainer</p>
            </div>
            <MoreHorizontal className="ml-auto size-4 text-slate-400" />
          </div>
        </div>
      </aside>

      <section className="lg:pl-64">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <button className="rounded-lg p-2 text-slate-600 lg:hidden" aria-label="Open navigation"><Menu className="size-5" /></button>
          <div className="hidden sm:block">
            <p className="text-sm text-slate-500">Monday, 23 September</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
              <Bell className="size-5" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-orange-500 ring-2 ring-white" />
            </button>
            <button className="hidden items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 sm:flex">
              <Plus className="size-4" /> Add client
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-600">Good morning, Hitesh</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Your coaching overview</h1>
              <p className="mt-2 text-sm text-slate-500">Here&apos;s what needs your attention today.</p>
            </div>
            <button className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white sm:hidden"><Plus className="size-4" /> Add client</button>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Active clients" value="24" detail="2 new this month" icon={Users} tone="bg-violet-50 text-violet-600" />
            <Metric label="Completed today" value="18" detail="75% of scheduled" icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
            <Metric label="Pending today" value="4" detail="Need a reminder" icon={Clock3} tone="bg-amber-50 text-amber-600" />
            <Metric label="Average adherence" value="84%" detail="Up 6% this month" icon={TrendingUp} tone="bg-orange-50 text-orange-600" />
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Today&apos;s workouts</h2>
                  <p className="mt-1 text-sm text-slate-500">3 client sessions scheduled</p>
                </div>
                <Link href="#" className="flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-950">View calendar <ChevronRight className="size-4" /></Link>
              </div>
              <div className="mt-5 divide-y divide-slate-100">
                {sessions.map((session) => (
                  <div key={session.name} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ${session.tone}`}>{session.initials}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{session.name}</p>
                      <p className="truncate text-xs text-slate-500">{session.workout}</p>
                    </div>
                    <div className="hidden text-right sm:block"><p className="text-sm font-medium">{session.time}</p><p className="text-xs text-slate-500">{session.status}</p></div>
                    <ChevronRight className="size-5 text-slate-300" />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-300"><Activity className="size-4 text-emerald-400" /> This week</div>
              <p className="mt-6 text-5xl font-bold tracking-tight">82%</p>
              <p className="mt-2 text-sm text-slate-300">Average client workout completion</p>
              <div className="mt-7 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full w-[82%] rounded-full bg-emerald-400" /></div>
              <div className="mt-5 flex items-center gap-2 text-sm"><span className="rounded-full bg-emerald-400/15 px-2 py-1 font-semibold text-emerald-300">+7.4%</span><span className="text-slate-300">versus last week</span></div>
            </section>
          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Client progress</h2><p className="mt-1 text-sm text-slate-500">Recent goal and consistency updates</p></div><Link href="#" className="text-sm font-semibold text-slate-700 hover:text-slate-950">View all clients</Link></div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {progress.map((client) => (
                <div key={client.name} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-full text-xs font-bold ${client.tone}`}>{client.initials}</span><div><p className="text-sm font-semibold">{client.name}</p><p className="text-xs text-slate-500">{client.detail}</p></div></div>
                  <div className="mt-5 flex items-end justify-between"><p className="text-2xl font-bold">{client.value}</p><span className="text-xs font-semibold text-emerald-600">{client.change}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: client.value }} /></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <aside className="fixed inset-y-0 hidden w-64 border-r border-slate-200 bg-white px-7 py-6 lg:block">
        <div className="h-9 w-28 rounded-xl bg-slate-200" />
        <div className="mt-10 space-y-3">
          <div className="h-10 rounded-xl bg-slate-200" />
          <div className="h-10 rounded-xl bg-slate-100" />
          <div className="h-10 rounded-xl bg-slate-100" />
          <div className="h-10 rounded-xl bg-slate-100" />
        </div>
      </aside>
      <section className="lg:pl-64">
        <header className="h-20 border-b border-slate-200 bg-white" />
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          <div className="h-4 w-32 rounded bg-emerald-100" />
          <div className="mt-3 h-10 w-80 max-w-full rounded-lg bg-slate-200" />
          <div className="mt-3 h-4 w-64 max-w-full rounded bg-slate-100" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {["one", "two", "three", "four"].map((key) => <div key={key} className="h-36 rounded-2xl border border-slate-200 bg-white" />)}
          </div>
          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
            <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
            <div className="h-80 rounded-2xl bg-slate-900" />
          </div>
          <div className="mt-6 h-72 rounded-2xl border border-slate-200 bg-white" />
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><span className={`grid size-9 place-items-center rounded-xl ${tone}`}><Icon className="size-[18px]" /></span></div>
      <p className="mt-5 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
