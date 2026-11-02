import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { refreshSession, unwrap } from "@/lib/api/client";
import { login, logout } from "../api/auth-api";
import type { LoginInput } from "../schemas/session";
import { useAuthStore } from "../store/auth-store";

/** Restores the session from the refresh cookie after a page load. */
export function useSessionBootstrap() {
  const status = useAuthStore((s) => s.status);
  useQuery({
    queryKey: ["auth", "bootstrap"],
    queryFn: refreshSession,
    enabled: status === "unknown",
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  return status;
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (input: LoginInput) => unwrap(await login(input)),
    onSuccess: setSession,
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      clear();
      queryClient.clear();
      router.replace("/login");
    },
  });
}
