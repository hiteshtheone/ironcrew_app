"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ComponentType, type ReactNode } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  Dumbbell,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Settings,
  Users,
} from "lucide-react";

import { HeaderLogoutButton, SidebarLogoutButton } from "@/components/logout-button";

export type TrainerSection =
  | "dashboard"
  | "clients"
  | "programs"
  | "calendar"
  | "messages"
  | "settings";

const navigation: { id: TrainerSection; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "clients", label: "Clients", icon: Users },
  { id: "programs", label: "Programs", icon: Dumbbell },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "messages", label: "Messages", icon: MessageSquare },
];

const sectionTitle: Record<Exclude<TrainerSection, "dashboard" | "clients" | "programs">, string> = {
  calendar: "Calendar",
  messages: "Messages",
  settings: "Settings",
};

function isTrainerSection(value: string | null): value is TrainerSection {
  return value === "dashboard" || value === "clients" || value === "programs" || value === "calendar" || value === "messages" || value === "settings";
}

export function TrainerShell({
  profile,
  overview,
  clients,
  programs,
}: {
  profile: { fullName: string; initials: string; dateLabel: string };
  overview: ReactNode;
  clients: ReactNode;
  programs: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("section");
  const section: TrainerSection = isTrainerSection(requested) ? requested : "dashboard";

  const openSection = (id: TrainerSection) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "dashboard") {
      params.delete("section");
      params.delete("client");
      params.delete("program");
      params.delete("phase");
      params.delete("week");
    } else {
      params.set("section", id);
      if (id !== "clients") params.delete("client");
      if (id !== "programs") {
        params.delete("program");
        params.delete("phase");
        params.delete("week");
      }
    }
    const query = params.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard");
  };

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <aside className="fixed inset-y-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <button type="button" onClick={() => openSection("dashboard")} className="flex items-center gap-3 px-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">T</span>
          <span className="text-lg font-semibold tracking-tight">Trainer</span>
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
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <button className="rounded-lg p-2 text-slate-600 lg:hidden" aria-label="Open navigation"><Menu className="size-5" /></button>
          <div className="hidden sm:block">
            <p className="text-sm text-slate-500">{profile.dateLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
              <Bell className="size-5" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-orange-500 ring-2 ring-white" />
            </button>
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
        {section !== "dashboard" && section !== "clients" && section !== "programs" && (
          <EmptySection title={sectionTitle[section]} />
        )}
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

function EmptySection({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Nothing here yet.</p>
    </div>
  );
}
