import Link from "next/link";
import {
  Activity,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Menu,
  Settings,
  TrendingUp,
} from "lucide-react";

import type { AssignmentStatus, ClientDashboardData, ClientDay } from "@/lib/dashboard/client-week";
import { statusLabel } from "@/lib/dashboard/client-week";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: Activity, active: true },
  { label: "Workouts", href: "#", icon: Dumbbell },
  { label: "Calendar", href: "#", icon: CalendarDays },
  { label: "Progress", href: "#", icon: TrendingUp },
];

export function ClientDashboard({ data }: { data: ClientDashboardData }) {
  console.log("Loading client dashboard, Data = ", data)
  if (data.kind === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6 text-slate-950">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold">Couldn&apos;t load your plan</h1>
          <p className="mt-2 text-sm text-slate-500">{data.message}</p>
        </div>
      </main>
    );
  }

  const completion =
    data.kind === "ready" && data.scheduledCount > 0
      ? Math.round((data.completedCount / data.scheduledCount) * 100)
      : 0;

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <aside className="fixed inset-y-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">IC</span>
          <span className="text-lg font-semibold tracking-tight">Ironcrew</span>
        </Link>
        <nav className="mt-10 space-y-1">
          {navigation.map(({ label, href, icon: Icon, active }) => (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"}`}
            >
              <Icon className="size-[18px]" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-4">
          <Link href="#" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950">
            <Settings className="size-[18px]" /> Settings
          </Link>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="grid size-9 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{data.initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{data.firstName}</p>
              <p className="truncate text-xs text-slate-500">Client</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="lg:pl-64">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <button className="rounded-lg p-2 text-slate-600 lg:hidden" aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <p className="hidden text-sm text-slate-500 sm:block">{data.dateLabel}</p>
          <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
            <Bell className="size-5" />
          </button>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          <p className="text-sm font-medium text-emerald-600">{data.greeting}, {data.firstName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Your training week</h1>
          <p className="mt-2 text-sm text-slate-500">
            {data.kind === "unlinked"
              ? "This login is not connected to a client profile yet."
              : "Here is the plan your trainer assigned for this week."}
          </p>

          {data.kind === "unlinked" ? (
            <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm">
              <h2 className="text-lg font-bold">Account not linked</h2>
              <p className="mt-2 max-w-xl text-sm text-slate-500">
                Ask your trainer to connect this login to your client record. Your weekly plan will show up here after that.
              </p>
            </section>
          ) : (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="This week" value={String(data.scheduledCount)} detail="Workouts assigned" icon={Dumbbell} tone="bg-violet-50 text-violet-600" />
                <Metric label="Completed" value={String(data.completedCount)} detail="Marked done" icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
                <Metric label="Remaining" value={String(data.remainingCount)} detail="Still to do" icon={Clock3} tone="bg-amber-50 text-amber-600" />
                <Metric label="Program" value={data.programName ?? "None"} detail={data.programName ? "Active plan" : "No active program"} icon={Activity} tone="bg-orange-50 text-orange-600" compact={Boolean(data.programName)} />
              </div>

              <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-lg font-bold">Workout plan</h2>
                  <p className="mt-1 text-sm text-slate-500">Monday through Sunday</p>
                  {data.days.every((day) => day.workouts.length === 0) && (
                    <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Your trainer hasn&apos;t assigned a workout this week.
                    </p>
                  )}
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    {data.days.map((day) => (
                      <DayCard key={day.date} day={day} />
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Activity className="size-4 text-emerald-400" /> Week status
                  </div>
                  <p className="mt-6 text-5xl font-bold tracking-tight">{completion}%</p>
                  <p className="mt-2 text-sm text-slate-300">
                    {data.completedCount} of {data.scheduledCount} workouts completed
                  </p>
                  <div className="mt-7 h-2 overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${completion}%` }} />
                  </div>
                  <p className="mt-5 text-sm text-slate-300">
                    {data.programName ? `Following ${data.programName}` : "No active program assigned"}
                  </p>
                </section>
              </div>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold">Workout of the day</h2>
                {data.todayWorkouts.length === 0 ? (
                  <div className="mt-4">
                    <p className="text-sm text-slate-500">Rest day. Nothing is scheduled for today.</p>
                    {data.nextWorkout && (
                      <p className="mt-2 text-sm font-medium text-slate-800">
                        Next up: {data.nextWorkout.name} · {data.nextWorkout.dateLabel}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {data.todayWorkouts.map((workout) => (
                      <article key={workout.id} className="rounded-xl border border-slate-100 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold">{workout.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {workout.durationMinutes ? `${workout.durationMinutes} min` : "Duration not set"}
                            </p>
                          </div>
                          <StatusBadge status={workout.status} />
                        </div>
                        {workout.exercises.length === 0 ? (
                          <p className="mt-4 text-sm text-slate-500">No exercises listed for this workout.</p>
                        ) : (
                          <ol className="mt-4 divide-y divide-slate-100">
                            {workout.exercises.map((exercise, index) => (
                              <li key={exercise.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{index + 1}</span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{exercise.name}</p>
                                  {exercise.detail && <p className="text-xs text-slate-500">{exercise.detail}</p>}
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function DayCard({ day }: { day: ClientDay }) {
  const visible = day.workouts.filter((workout) => workout.status !== "cancelled");
  const primary = visible[0] ?? day.workouts[0];

  return (
    <div className={`rounded-xl border p-3 ${day.isToday ? "border-slate-950 bg-slate-950 text-white" : "border-slate-100 bg-slate-50"}`}>
      <p className={`text-xs font-semibold ${day.isToday ? "text-slate-300" : "text-slate-500"}`}>{day.weekday}</p>
      <p className="mt-1 text-lg font-bold">{day.dayNumber}</p>
      {primary ? (
        <>
          <p className="mt-3 line-clamp-2 text-xs font-medium">{primary.name}</p>
          <p className={`mt-1 text-[11px] ${day.isToday ? "text-slate-300" : "text-slate-500"}`}>
            {visible.length > 1 ? `${visible.length} workouts` : statusLabel(primary.status)}
          </p>
        </>
      ) : (
        <p className={`mt-3 text-xs ${day.isToday ? "text-slate-300" : "text-slate-500"}`}>Rest</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const tone =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "in_progress"
        ? "bg-violet-50 text-violet-700"
        : status === "skipped"
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-600";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{statusLabel(status)}</span>;
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid size-9 place-items-center rounded-xl ${tone}`}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className={`mt-5 font-bold tracking-tight ${compact ? "truncate text-xl" : "text-3xl"}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
