import {
  Activity,
  KeyRound,
  MessagesSquare,
  Server,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: "/spend" | "/requests" | "/keys" | "/teams" | "/providers" | "/playground";
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/spend", label: "Spend", icon: Wallet },
  { href: "/requests", label: "Requests", icon: Activity },
  { href: "/keys", label: "Virtual keys", icon: KeyRound },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/providers", label: "Providers", icon: Server },
  { href: "/playground", label: "Playground", icon: MessagesSquare },
];
