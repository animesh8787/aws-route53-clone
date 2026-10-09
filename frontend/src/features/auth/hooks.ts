"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { User } from "@/types/api";

export const authKeys = { me: ["auth", "me"] as const };

export interface AuthConfig {
  registration_enabled: boolean;
  password_min_length: number;
  max_failed_logins: number;
  lockout_minutes: number;
}

export interface SessionInfo {
  id: number;
  created_at: string;
  last_seen_at: string;
  user_agent: string;
  ip_address: string;
  is_current: boolean;
}

export function useCurrentUser() {
  return useQuery({ queryKey: authKeys.me, queryFn: () => api.get<User>("/auth/me"), staleTime: 60_000, retry: false });
}

export function useAuthConfig() {
  return useQuery({ queryKey: ["auth", "config"], queryFn: () => api.get<AuthConfig>("/auth/config"), staleTime: 5 * 60_000 });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<User>("/auth/login", body),
    onSuccess: (user) => {
      client.clear();
      client.setQueryData(authKeys.me, user);
    },
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; display_name: string }) => api.post<User>("/auth/register", body),
    onSuccess: (user) => {
      client.clear();
      client.setQueryData(authKeys.me, user);
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ detail: string }>("/auth/logout"),
    onSettled: () => client.clear(),
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (display_name: string) => api.patch<User>("/auth/me", { display_name }),
    onSuccess: (user) => client.setQueryData(authKeys.me, user),
  });
}

export function useChangePassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) => api.post<{ detail: string }>("/auth/change-password", body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["auth", "sessions"] }),
  });
}

export function useSessions() {
  return useQuery({ queryKey: ["auth", "sessions"], queryFn: () => api.get<SessionInfo[]>("/auth/sessions") });
}

export function useRevokeSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ detail: string }>(`/auth/sessions/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["auth", "sessions"] }),
  });
}

export function useRevokeOtherSessions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ detail: string }>("/auth/sessions/revoke-others"),
    onSuccess: () => client.invalidateQueries({ queryKey: ["auth", "sessions"] }),
  });
}

export function useAccountSummary() {
  return useQuery({
    queryKey: ["account", "summary"],
    queryFn: () => api.get<{ zones: number; resources: number; health_checks: number; empty: boolean }>("/account/summary"),
  });
}

export function useAccountData() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries();
  return {
    load: useMutation({ mutationFn: () => api.post<{ detail: string }>("/account/sample-data"), onSuccess: refresh }),
    clear: useMutation({ mutationFn: () => api.post<{ detail: string }>("/account/clear-data"), onSuccess: refresh }),
  };
}

export function useCloseAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.delete<{ detail: string }>("/auth/me", undefined, { password }),
    onSuccess: () => client.clear(),
  });
}
