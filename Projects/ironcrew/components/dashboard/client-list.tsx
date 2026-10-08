import Link from "next/link";
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

import { HeaderLogoutButton, LogoutButton, SidebarLogoutButton } from "@/components/logout-button";
import type { ClientListData, ClientRecord } from "@/lib/dashboard/load-client-list";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: Activity},
  { label: "Clients", href: "/clients", icon: Users , active: true},
  { label: "Programs", href: "#", icon: Dumbbell },
  { label: "Calendar", href: "#", icon: CalendarDays },
  { label: "Messages", href: "#", icon: MessageSquare },
];

export function ClientListDashboard({ data }: { data: ClientListData}) {
  if (data.kind === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6 text-slate-950">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold">Couldn&apos;t load your clients</h1>
          <p className="mt-2 text-sm text-slate-500">{data.message}</p>
          <LogoutButton className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Log out
          </LogoutButton>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <aside className="fixed inset-y-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">T</span>
          <span className="text-lg font-semibold tracking-tight">Trainer</span>
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
          <SidebarLogoutButton />
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="grid size-9 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{data.initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{data.fullName}</p>
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
            <p className="text-sm text-slate-500">{data.dateLabel}</p>
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

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-600">{data.greeting}, {data.firstName}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Your coaching overview</h1>
              <p className="mt-2 text-sm text-slate-500">Here&apos;s what needs your attention today.</p>
            </div>
            <Link href="/clients/new" className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white sm:hidden">
              <Plus className="size-4" /> Add client
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Active clients" value={String(data.activeClients)} detail={data.newClientsLabel} icon={Users} tone="bg-violet-50 text-violet-600" />
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="p-4">
                <h2 className="text-xl font-bold mb-4">Active Clients</h2>
                {/* 1. Always check if the array has items */}
                {data.myClients.length === 0 ? (
                  <p>No clients found.</p>
                ) : (
                  <ul className="space-y-2">
                    {/* 2. Map through the array to output JSX*/}
                    {data.myClients.map((ClientRecord) => (
                      <li
                        key={ClientRecord.name}
                        className="p-3 border rounded shadow-sm bg-white flex justify-between"
                      >
                        <span className="font-medium">{ClientRecord.name}</span>
                        <span className="text-gray-500">{ClientRecord.email}</span>
                        <span className="text-gray-500">{ClientRecord.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

export function ClientListSkeleton() {
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

function sessionCountLabel(count: number) {
  if (count === 0) return "No client sessions scheduled";
  if (count === 1) return "1 client session scheduled";
  return `${count} client sessions scheduled`;
}

function changeTone(change: string) {
  if (change.startsWith("+")) return "text-emerald-600";
  if (change.startsWith("-")) return "text-rose-600";
  return "text-slate-500";
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
