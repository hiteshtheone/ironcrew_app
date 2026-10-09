"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";


export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    console.log("Signing up ...")
    try {
      const { data: userData, error: errorSignUp } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/protected`,
        },
      });
      if (errorSignUp) throw errorSignUp;

      // If client user by this name already exist then this is client user otherwise this is trainer
      // set profile accordingly
      console.log("Creating Profile for this new client.")

      // Get client user if it exists. use email id for that
      // Once you get client then check for profileID and then actual profile
      // After creating new profile update client's profileID

      const { data: clientUser , error: clientLookupError } = await supabase
        .from('clients')
        .select('*')
        .eq("email", email)
        .maybeSingle()

      if (clientLookupError) throw clientLookupError;

      // If client entry doesn't exist in the DB for this user, then this is new client else it is new trainer.
      // Populate trainer table and set profile accordingly
      if (!clientUser) {
        console.log("This is trainer signing up.")
        const trainerSetupError = await ensureCurrentUserIsTrainer(supabase, userData.user);
        if (trainerSetupError) return trainerSetupError
        router.push("/auth/sign-up-success");
      } else {
        if (!clientUser.profile_id){
          console.log("Client exists but profile is null. Something is wrong. Let us fix by creating new profile.")
        }
        // Profile id is Auth ID not client's ID
        const { data: profile, error: profileLookupError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (profileLookupError) return profileLookupError;

        const firstName = clientUser.first_name;
        const lastName = clientUser.last_name;
        const fullName = `${firstName} ${lastName}`;

        if (!profile) {
          console.log("Profile does not exist for this new client. Creating one.")
          const { error: profileInsertError } = await supabase.from("profiles").insert({
            id: userData.user.id,
            role: "client",
            full_name: fullName.slice(0, 120),
          });
          console.log("Profile create started, checking errors")
          if (profileInsertError){
            console.log('Profile insert failed:', profileInsertError.message)
            throw profileInsertError
          }
        } else {
          // if profile already exists for this user then maybe it was from previous error or something
          // Log it for now
          console.log("Profile exists for this new client, move on.")
        }
      }

      console.log("Updating profile id for the client id ", clientUser.id)
      console.log("Updating profile id for the client .. profile id ", userData.user.id)
      // Updating profile id for the client
      const { data: updatedClients, error: updateError } = await supabase
        .from('clients')                 // 1. Specify the table
        .update({ profile_id: userData.user.id }) // 2. Pass an object with the changes
        .eq('id', clientUser.id)        // 3. Filter to target the exact row
        .select();

      if (updateError) {
        console.log('Update failed:', updateError.message)
        throw updateError
      }
      console.log("Updated client with profile ", updatedClients)
      // new code ends here

      router.push("/auth/sign-up-success");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="repeat-password">Repeat Password</Label>
                </div>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating an account..." : "Sign up"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/auth/login" className="underline underline-offset-4">
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


async function ensureCurrentUserIsTrainer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
) {
  const { data: trainer, error: trainerLookupError } = await supabase
    .from("trainers")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (trainerLookupError) return trainerLookupError;
  if (trainer) return null;

  const metadataName = user.user_metadata?.full_name;
  const fullName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    user.email?.split("@")[0] ||
    "Trainer";

  const { data: profile, error: profileLookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileLookupError) return profileLookupError;

  if (!profile) {
    const { error: profileInsertError } = await supabase.from("profiles").insert({
      id: user.id,
      role: "trainer",
      full_name: fullName.slice(0, 120),
    });
    if (profileInsertError && profileInsertError.code !== "23505") {
      return profileInsertError;
    }
  }

  const { error: trainerInsertError } = await supabase.from("trainers").insert({
    id: user.id,
  });
  if (trainerInsertError && trainerInsertError.code !== "23505") {
    return trainerInsertError;
  }

  return null;
}
