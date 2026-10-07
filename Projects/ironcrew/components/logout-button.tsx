"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const sidebarClassName =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-950";

const headerClassName =
  "inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-950";

type LogoutButtonProps = {
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "className">;

export function LogoutButton({ className, children = "Logout", ...props }: LogoutButtonProps) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (className) {
    return (
      <button type="button" onClick={logout} className={className} {...props}>
        {children}
      </button>
    );
  }

  return (
    <Button onClick={logout} {...props}>
      {children}
    </Button>
  );
}

export function SidebarLogoutButton() {
  return (
    <LogoutButton className={sidebarClassName}>
      <LogOut className="size-[18px]" />
      Log out
    </LogoutButton>
  );
}

export function HeaderLogoutButton() {
  return (
    <LogoutButton className={headerClassName} aria-label="Log out">
      <LogOut className="size-[18px]" />
      <span className="sr-only sm:not-sr-only">Log out</span>
    </LogoutButton>
  );
}
