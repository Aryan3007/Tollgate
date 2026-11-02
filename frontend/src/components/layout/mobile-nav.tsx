"use client";

import { Menu, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useNavStore } from "@/features/shell/store/nav-store";
import { SidebarContent } from "./sidebar-content";

export function MobileNav() {
  const open = useNavStore((s) => s.mobileOpen);
  const setOpen = useNavStore((s) => s.setMobileOpen);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-5 text-primary" aria-hidden />
        Tollgate
      </div>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
