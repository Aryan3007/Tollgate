"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiErrorOf } from "@/lib/api/client";
import { useRevokeKey } from "../hooks/use-keys";
import { useKeysUiStore } from "../store/keys-ui-store";

export function RevokeKeyDialog() {
  const target = useKeysUiStore((s) => s.revokeTarget);
  const setTarget = useKeysUiStore((s) => s.setRevokeTarget);
  const revoke = useRevokeKey();

  function confirm() {
    if (!target) return;
    // The table already shows the key as revoked (optimistic), so close now.
    revoke.mutate(target.id);
    setTarget(null);
  }

  return (
    <>
      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <AlertDialogContent className="data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{target?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Apps using <span className="font-mono">{target?.prefix}…</span>{" "}
              will get a 401 on their next request. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              size="lg"
              variant="destructive"
              onClick={confirm}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {revoke.isError && (
        <p
          role="alert"
          className="rounded-lg bg-danger px-4 py-3 text-sm text-danger-foreground"
        >
          Couldn’t revoke the key: {apiErrorOf(revoke.error).message}
        </p>
      )}
    </>
  );
}
