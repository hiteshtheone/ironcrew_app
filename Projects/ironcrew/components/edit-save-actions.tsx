"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Edit mode resets when `resetKey` changes, for example when another record is selected. */
export function useEditMode(resetKey: string) {
  const [editing, setEditing] = useState(false);
  const [seenKey, setSeenKey] = useState(resetKey);

  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setEditing(false);
  }

  return {
    editing,
    startEditing: () => setEditing(true),
    stopEditing: () => setEditing(false),
  };
}

const dashboardEditClass =
  "rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";
const dashboardSaveClass =
  "rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";

export function EditSaveActions({
  editing,
  dirty,
  pending = false,
  saveLabel,
  pendingLabel = "Saving...",
  onEdit,
  onCancel,
  onSave,
  saveType = "submit",
  appearance = "dashboard",
  className = "flex flex-wrap items-center gap-2",
  editClassName,
  saveClassName,
}: {
  editing: boolean;
  dirty: boolean;
  pending?: boolean;
  saveLabel: string;
  pendingLabel?: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave?: () => void;
  saveType?: "submit" | "button";
  appearance?: "dashboard" | "button";
  className?: string;
  editClassName?: string;
  saveClassName?: string;
}) {
  const canSave = editing && dirty && !pending;
  const label = pending ? pendingLabel : saveLabel;
  const editClass = editClassName ?? dashboardEditClass;
  const saveClass = saveClassName ?? dashboardSaveClass;

  if (appearance === "button") {
    return (
      <div className={className}>
        {editing ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onEdit} disabled={pending}>
            Edit
          </Button>
        )}
        <Button type={saveType} onClick={onSave} disabled={!canSave} className={saveClassName}>
          {label}
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      {editing ? (
        <button type="button" onClick={onCancel} disabled={pending} className={editClass}>
          Cancel
        </button>
      ) : (
        <button type="button" onClick={onEdit} disabled={pending} className={editClass}>
          Edit
        </button>
      )}
      <button type={saveType} onClick={onSave} disabled={!canSave} className={saveClass}>
        {label}
      </button>
    </div>
  );
}

const dashboardDeleteClass =
  "rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60";
const dashboardConfirmClass =
  "rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";

/** Two-step delete: the first click reveals the warning, the second click removes the record. */
export function DeleteControl({
  itemLabel,
  detail,
  pending = false,
  disabled = false,
  onDelete,
  appearance = "dashboard",
  className = "flex flex-wrap items-center gap-2",
}: {
  itemLabel: string;
  detail: string;
  pending?: boolean;
  disabled?: boolean;
  onDelete: () => void;
  appearance?: "dashboard" | "button";
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const busy = pending || disabled;

  if (!armed) {
    if (appearance === "button") {
      return (
        <Button type="button" variant="outline" onClick={() => setArmed(true)} disabled={busy} className="text-red-700">
          Delete
        </Button>
      );
    }
    return (
      <button type="button" onClick={() => setArmed(true)} disabled={busy} className={dashboardDeleteClass}>
        Delete
      </button>
    );
  }

  const confirmLabel = pending ? "Deleting..." : `Delete ${itemLabel}`;

  if (appearance === "button") {
    return (
      <div className={className}>
        <p className="text-sm text-slate-600">{detail}</p>
        <Button type="button" variant="outline" onClick={() => setArmed(false)} disabled={pending}>
          Keep
        </Button>
        <Button type="button" variant="destructive" onClick={onDelete} disabled={pending}>
          {confirmLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="w-full text-sm text-slate-600">{detail}</p>
      <button type="button" onClick={() => setArmed(false)} disabled={pending} className={dashboardEditClass}>
        Keep
      </button>
      <button type="button" onClick={onDelete} disabled={pending} className={dashboardConfirmClass}>
        {confirmLabel}
      </button>
    </div>
  );
}
