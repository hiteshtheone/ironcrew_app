"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  CalendarDays,
  Dumbbell,
  Menu,
  MoreHorizontal,
  Plus,
  Settings,
  Users,
} from "lucide-react";

import { MyInfoForm } from "@/components/dashboard/my-info-form";
import { MonthCalendar } from "@/components/dashboard/month-calendar";
import { HeaderLogoutButton, SidebarLogoutButton } from "@/components/logout-button";
import { firstNameFrom } from "@/lib/dashboard/client-week";
import { stripWorkoutParams } from "@/lib/dashboard/workout-filters";

export type TrainerSection =
  | "dashboard"
  | "clients"
  | "programs"
  | "calendar"
  | "settings";

const navigation: { id: TrainerSection; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "clients", label: "Clients", icon: Users },
  { id: "programs", label: "Programs", icon: Dumbbell },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

function isTrainerSection(value: string | null): value is TrainerSection {
  return value === "dashboard" || value === "clients" || value === "programs" || value === "calendar" || value === "settings";
}

export function TrainerShell({
  profile,
  overview,
  clients,
  programs,
  today,
}: {
  profile: { fullName: string; initials: string; dateLabel: string };
  overview: ReactNode;
  clients: ReactNode;
  programs: ReactNode;
  /** Profile-timezone date, YYYY-MM-DD. */
  today: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navOpen, setNavOpen] = useState(false);
  const requested = searchParams.get("section");
  const section: TrainerSection = isTrainerSection(requested) ? requested : "dashboard";
  const firstName = firstNameFrom(profile.fullName);

  const openSection = (id: TrainerSection) => {
    setNavOpen(false);
    // Workout filters belong to a client detail view. Drop them when leaving Clients.
    const params = id === "clients"
      ? new URLSearchParams(searchParams.toString())
      : stripWorkoutParams(searchParams.toString());
    if (id === "dashboard") {
      params.delete("section");
      params.delete("client");
      params.delete("program");
      params.delete("phase");
      params.delete("week");
      params.delete("creating");
    } else {
      params.set("section", id);
      if (id !== "clients") params.delete("client");
      if (id !== "programs") {
        params.delete("program");
        params.delete("phase");
        params.delete("week");
        params.delete("creating");
      }
    }
    const query = params.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard");
  };

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <aside className={`fixed inset-y-0 z-50 w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 ${navOpen ? "flex" : "hidden lg:flex"}`}>
        <button type="button" onClick={() => openSection("dashboard")} className="flex min-w-0 items-center gap-3 px-3">
          <img src="/icon.png" alt="SEMA Fitness" width={36} height={36} className="size-9 shrink-0 rounded-[22%]" />
          <span className="truncate text-lg font-semibold tracking-tight">{firstName}</span>
        </button>

        <nav className="mt-10 space-y-1">
          {navigation.map(({ id, label, icon: Icon }) => (
            <SectionButton key={id} active={section === id} onClick={() => openSection(id)}>
              <Icon className="size-[18px]" />
              <span>{label}</span>
            </SectionButton>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-100 pt-4">
          <SectionButton active={section === "settings"} onClick={() => openSection("settings")}>
            <Settings className="size-[18px]" /> Settings
          </SectionButton>
          <SidebarLogoutButton />
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="grid size-9 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{profile.initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile.fullName}</p>
              <p className="truncate text-xs text-slate-500">Trainer</p>
            </div>
            <MoreHorizontal className="ml-auto size-4 text-slate-400" />
          </div>
        </div>
      </aside>

      <section className="lg:pl-64">
        <header className="flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 text-slate-600 lg:hidden"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((open) => !open)}
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{profile.fullName}</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{profile.dateLabel}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <HeaderLogoutButton />
            <Link
              href="/clients/new"
              className="hidden items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 sm:flex"
            >
              <Plus className="size-4" /> Add client
            </Link>
          </div>
        </header>

        {section === "dashboard" && overview}
        {section === "clients" && clients}
        {section === "programs" && programs}
        {section === "settings" && <MyInfoForm />}
        {section === "calendar" && <MonthCalendar today={today} endpoint="/api/calendar" showClientName />}
      </section>
    </main>
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
