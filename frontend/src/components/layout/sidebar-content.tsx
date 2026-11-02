"use client";

import { BookOpen, LogOut, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { useLogout } from "@/features/auth/hooks/use-auth";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

const itemClass =
  "flex h-9 items-center gap-3 rounded-lg px-3 text-[15px] text-foreground/80 hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const admin = useAuthStore((s) => s.admin);
  const logout = useLogout();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <span className="flex size-10 items-center justify-center rounded-lg border bg-background">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">Tollgate</p>
          <p className="truncate text-sm text-muted-foreground">
            Self-hosted LLM gateway
          </p>
        </div>
      </div>

      <div className="px-4 pb-5">
        <Link
          href="/keys?create=1"
          onClick={onNavigate}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full justify-start gap-2 bg-background text-[15px]",
          )}
        >
          <Plus aria-hidden />
          New virtual key
        </Link>
      </div>

      <nav aria-label="Main" className="border-t px-4 pt-5">
        <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Gateway
        </p>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    itemClass,
                    active && "bg-sidebar-accent font-medium text-foreground",
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t px-4 py-4">
        <a
          href={`${env.NEXT_PUBLIC_API_URL}/api/docs`}
          target="_blank"
          rel="noreferrer"
          className={itemClass}
        >
          <BookOpen className="size-[18px]" aria-hidden />
          API reference
        </a>
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2">
          <p
            className="min-w-0 truncate text-sm text-muted-foreground"
            title={admin?.email}
          >
            {admin?.email}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </div>
  );
}
