"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamsUiStore } from "../store/teams-ui-store";

export function NewTeamButton() {
  const openCreate = useTeamsUiStore((s) => s.openCreate);
  return (
    <Button
      size="lg"
      className="h-10 gap-2 px-4"
      onClick={openCreate}
    >
      <Plus aria-hidden />
      New team
    </Button>
  );
}
