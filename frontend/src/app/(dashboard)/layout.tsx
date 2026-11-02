import type { ReactNode } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { AuthGate } from "@/features/auth/components/auth-gate";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // On desktop the frame is exactly one screen tall; only <main> scrolls inside it.
  // lg:flex-none matters: flex-1 would set the height from the content and override lg:h-dvh.
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:h-dvh lg:flex-none lg:overflow-hidden lg:p-3">
      <div className="flex min-h-0 flex-1 flex-col bg-background lg:flex-row lg:overflow-hidden lg:rounded-2xl lg:border">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r bg-sidebar lg:block">
          <SidebarContent />
        </aside>
        <MobileNav />
        <main className="min-h-0 flex-1 lg:overflow-y-auto">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <AuthGate>{children}</AuthGate>
          </div>
        </main>
      </div>
    </div>
  );
}
