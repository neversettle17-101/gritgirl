"use client";

import { useRouter } from "next/navigation";
import { useUndoDelete } from "@/components/undo-delete";

/** Deletes with a ~5 s undo window (the toast lives in the root layout). */
export function VoidButton({ id, label, className }: { id: string; label: string; className?: string }) {
  const { scheduleDelete } = useUndoDelete();
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        scheduleDelete(id, label);
        router.push("/");
      }}
    >
      VOID (DELETE)
    </button>
  );
}
