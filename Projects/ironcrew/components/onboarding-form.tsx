"use client";

import { Dumbbell, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Role = "trainer" | "client";

const ROLE_OPTIONS: {
  value: Role;
  title: string;
  description: string;
  icon: typeof User;
}[] = [
  {
    value: "trainer",
    title: "Trainer",
    description: "Manage clients, build programs and assign workouts.",
    icon: Dumbbell,
  },
  {
    value: "client",
    title: "User",
    description: "Follow workouts and track your own progress.",
    icon: User,
  },
];

export function OnboardingForm({
  defaultFirstName,
  defaultLastName,
}: {
  defaultFirstName: string;
  defaultLastName: string;
}) {
  const [role, setRole] = useState<Role | null>(null);
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!role) {
      setError("Choose whether you are a trainer or a user");
      return;
    }

    setIsLoading(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("complete_onboarding", {
      p_role: role,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim() || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setIsLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Welcome to IronCrew</CardTitle>
        <CardDescription>Tell us how you will be using the app.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-6">
            <div
              role="radiogroup"
              aria-label="I am a"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {ROLE_OPTIONS.map(({ value, title, description, icon: Icon }) => {
                const selected = role === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRole(value)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-accent",
                      selected && "border-primary ring-2 ring-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-semibold">{title}</span>
                    <span className="text-sm text-muted-foreground">
                      {description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="first-name">First name</Label>
                <Input
                  id="first-name"
                  required
                  maxLength={80}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input
                  id="last-name"
                  maxLength={80}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Setting up your account..." : "Continue"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
