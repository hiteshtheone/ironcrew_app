"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function AccountDataControls() {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/me/export");
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Couldn't download your data");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ironwill-fitness-data.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Couldn't download your data");
    } finally {
      setExporting(false);
    }
  };

  const removeAccount = async () => {
    if (confirm !== "delete") return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/me/account", { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Couldn't delete your account");
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.replace("/auth/login");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Couldn't delete your account");
      setDeleting(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold">Your data</h2>
      <p className="mt-1 text-sm text-slate-500">
        Download a copy of this account, or delete the login. See the{" "}
        <a href="/privacy" className="font-medium underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => void download()}
        disabled={exporting}
        className="mt-4 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-50 disabled:opacity-60"
      >
        {exporting ? "Preparing…" : "Download my data"}
      </button>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold">Delete account</h3>
        <p className="mt-1 text-sm text-slate-500">
          This removes the login. A trainer who still has clients is asked to remove them first.
          Type delete to confirm.
        </p>
        <label htmlFor="delete-account-confirm" className="mt-3 block text-sm font-medium">
          Confirmation
        </label>
        <input
          id="delete-account-confirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="off"
          className="mt-2 flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
        />
        <button
          type="button"
          onClick={() => void removeAccount()}
          disabled={deleting || confirm !== "delete"}
          className="mt-3 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
    </section>
  );
}
