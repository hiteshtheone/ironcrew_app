"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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

import { HeaderLogoutButton, LogoutButton, SidebarLogoutButton } from "@/components/logout-button";
import {
  CLIENT_ASSIGNMENT_STATUSES,
  formatLongDate,
  isClientAssignmentStatus,
  statusLabel,
  type AssignmentStatus,
  type ClientDashboardData,
  type ClientDay,
  type ClientWorkout,
} from "@/lib/dashboard/client-week";

type ClientSection = "dashboard" | "workouts" | "calendar" | "progress" | "settings";

const navigation: { id: ClientSection; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "workouts", label: "Workouts", icon: Dumbbell },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "progress", label: "Progress", icon: TrendingUp },
];

const sectionTitle: Record<Exclude<ClientSection, "dashboard">, string> = {
  workouts: "Workouts",
  calendar: "Calendar",
  progress: "Progress",
  settings: "Settings",
};

export function ClientDashboard({ data }: { data: ClientDashboardData }) {
  if (data.kind === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6 text-slate-950">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold">Couldn&apos;t load your plan</h1>
          <p className="mt-2 text-sm text-slate-500">{data.message}</p>
          <LogoutButton className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Log out
          </LogoutButton>
        </div>
      </main>
    );
  }

  return <ClientShell data={data} />;
}

function ClientShell({ data }: { data: Exclude<ClientDashboardData, { kind: "error" }> }) {
  const [section, setSection] = useState<ClientSection>("dashboard");

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <aside className="fixed inset-y-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <button type="button" onClick={() => setSection("dashboard")} className="flex items-center gap-3 px-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">IC</span>
          <span className="text-lg font-semibold tracking-tight">Ironcrew</span>
        </button>
        <nav className="mt-10 space-y-1">
          {navigation.map(({ id, label, icon: Icon }) => (
            <SectionButton key={id} active={section === id} onClick={() => setSection(id)}>
              <Icon className="size-[18px]" />
              <span>{label}</span>
            </SectionButton>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-4">
          <SectionButton active={section === "settings"} onClick={() => setSection("settings")}>
            <Settings className="size-[18px]" /> Settings
          </SectionButton>
          <SidebarLogoutButton />
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
          <div className="flex items-center gap-1">
            <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
              <Bell className="size-5" />
            </button>
            <HeaderLogoutButton />
          </div>
        </header>

        {section === "dashboard" ? <ClientWeek data={data} /> : <EmptySection title={sectionTitle[section]} />}
      </section>
    </main>
  );
}

function ClientWeek({ data }: { data: Exclude<ClientDashboardData, { kind: "error" }> }) {
  const router = useRouter();
  const today = data.kind === "ready" ? (data.days.find((day) => day.isToday)?.date ?? "") : "";
  const [selectedDate, setSelectedDate] = useState(today);
  const [statusById, setStatusById] = useState<Record<string, AssignmentStatus>>({});
  const [pendingIds, setPendingIds] = useState<Record<string, true>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  const days =
    data.kind === "ready"
      ? data.days.map((day) => ({
          ...day,
          workouts: day.workouts.map((workout) => ({
            ...workout,
            status: statusById[workout.id] ?? workout.status,
          })),
        }))
      : [];
  const active = days.flatMap((day) => day.workouts).filter((workout) => workout.status !== "cancelled");
  const completedCount = active.filter((workout) => workout.status === "completed").length;
  const remainingCount = active.filter(
    (workout) => workout.status === "scheduled" || workout.status === "in_progress",
  ).length;
  const scheduledCount = data.kind === "ready" ? active.length : 0;
  const completion = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days.find((day) => day.isToday) ?? days[0];
  const selectedWorkouts = (selectedDay?.workouts ?? []).filter((workout) => workout.status !== "cancelled");
  const nextWorkout = days
    .filter((day) => day.date > today)
    .flatMap((day) =>
      day.workouts
        .filter((workout) => workout.status !== "cancelled")
        .map((workout) => ({ name: workout.name, dateLabel: formatLongDate(day.date) })),
    )[0] ?? null;

  const updateStatus = (workout: ClientWorkout, next: string) => {
    if (!isClientAssignmentStatus(next) || next === workout.status || pendingIds[workout.id]) return;
    const previous = workout.status;
    setStatusById((current) => ({ ...current, [workout.id]: next }));
    setPendingIds((current) => ({ ...current, [workout.id]: true }));
    setErrorById((current) => {
      const rest = { ...current };
      delete rest[workout.id];
      return rest;
    });

    void fetch(`/api/workout-assignments/${workout.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "Couldn't update this workout");
        router.refresh();
      })
      .catch((caught: unknown) => {
        setStatusById((current) => ({ ...current, [workout.id]: previous }));
        setErrorById((current) => ({
          ...current,
          [workout.id]: caught instanceof Error ? caught.message : "Couldn't update this workout",
        }));
      })
      .finally(() => {
        setPendingIds((current) => {
          const rest = { ...current };
          delete rest[workout.id];
          return rest;
        });
      });
  };

  return (
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
            <Metric label="This week" value={String(scheduledCount)} detail="Workouts assigned" icon={Dumbbell} tone="bg-violet-50 text-violet-600" />
            <Metric label="Completed" value={String(completedCount)} detail="Marked done" icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
            <Metric label="Remaining" value={String(remainingCount)} detail="Still to do" icon={Clock3} tone="bg-amber-50 text-amber-600" />
            <Metric label="Program" value={data.programName ?? "None"} detail={data.programName ? "Active plan" : "No active program"} icon={Activity} tone="bg-orange-50 text-orange-600" compact={Boolean(data.programName)} />
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold">Workout plan</h2>
              <p className="mt-1 text-sm text-slate-500">Monday through Sunday</p>
              {days.every((day) => day.workouts.length === 0) && (
                <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Your trainer hasn&apos;t assigned a workout this week.
                </p>
              )}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {days.map((day) => (
                  <DayCard
                    key={day.date}
                    day={day}
                    selected={day.date === selectedDay?.date}
                    onSelect={() => setSelectedDate(day.date)}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <Activity className="size-4 text-emerald-400" /> Week status
              </div>
              <p className="mt-6 text-5xl font-bold tracking-tight">{completion}%</p>
              <p className="mt-2 text-sm text-slate-300">
                {completedCount} of {scheduledCount} workouts completed
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
            <h2 className="text-lg font-bold">
              {selectedDay?.isToday ? "Workout of the day" : `${selectedDay?.weekday ?? "Selected"} workout`}
            </h2>
            {selectedWorkouts.length === 0 ? (
              <div className="mt-4">
                <p className="text-sm text-slate-500">
                  {selectedDay?.isToday
                    ? "Rest day. Nothing is scheduled for today."
                    : "Nothing is scheduled for this day."}
                </p>
                {selectedDay?.isToday && nextWorkout && (
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    Next up: {nextWorkout.name} · {nextWorkout.dateLabel}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {selectedWorkouts.map((workout) => (
                  <article key={workout.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold">{workout.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {workout.durationMinutes ? `${workout.durationMinutes} min` : "Duration not set"}
                        </p>
                      </div>
                      <StatusControl
                        workout={workout}
                        pending={Boolean(pendingIds[workout.id])}
                        onChange={(status) => updateStatus(workout, status)}
                      />
                    </div>
                    {errorById[workout.id] && (
                      <p className="mt-3 text-sm text-red-600">{errorById[workout.id]}</p>
                    )}
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
  );
}

function SectionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"}`}
    >
      {children}
    </button>
  );
}

function EmptySection({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Nothing here yet.</p>
    </div>
  );
}

function DayCard({
  day,
  selected,
  onSelect,
}: {
  day: ClientDay;
  selected: boolean;
  onSelect: () => void;
}) {
  const visible = day.workouts.filter((workout) => workout.status !== "cancelled");
  const primary = visible[0] ?? day.workouts[0];
  const tone = day.isToday
    ? "border-slate-950 bg-slate-950 text-white"
    : selected
      ? "border-slate-950 bg-white"
      : "border-slate-100 bg-slate-50";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border p-3 text-left ${tone}`}
    >
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
    </button>
  );
}

function StatusControl({
  workout,
  pending,
  onChange,
}: {
  workout: ClientWorkout;
  pending: boolean;
  onChange: (status: string) => void;
}) {
  if (!isClientAssignmentStatus(workout.status)) return <StatusBadge status={workout.status} />;

  return (
    <label className="text-xs font-semibold text-slate-500">
      <span className="sr-only">Status for {workout.name}</span>
      <select
        value={workout.status}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
      >
        {CLIENT_ASSIGNMENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {statusLabel(status)}
          </option>
        ))}
      </select>
    </label>
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
