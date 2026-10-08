"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { User } from "@/types/api";

export const authKeys = { me: ["auth", "me"] as const };

export function useCurrentUser() {
  return useQuery({ queryKey: authKeys.me, queryFn: () => api.get<User>("/auth/me"), staleTime: 60_000, retry: false });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<User>("/auth/login", body),
    onSuccess: (user) => client.setQueryData(authKeys.me, user),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ detail: string }>("/auth/logout"),
    onSettled: () => client.clear(),
  });
}
