"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useKeysUiStore } from "../store/keys-ui-store";

/** Also opens the drawer when the page is reached via the sidebar's `?create=1` link. */
export function NewKeyButton() {
  const setCreateOpen = useKeysUiStore((s) => s.setCreateOpen);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setCreateOpen(true);
      router.replace(pathname);
    }
  }, [searchParams, setCreateOpen, router, pathname]);

  return (
    <Button
      size="lg"
      className="h-10 gap-2 px-4"
      onClick={() => setCreateOpen(true)}
    >
      <Plus aria-hidden />
      New virtual key
    </Button>
  );
}
