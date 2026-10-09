"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface ActivityEvent {
  id: string;
  name: string;
  action: string;
  resource_type: string;
  href: string | null;
  detail: string;
  is_read: boolean;
  created_at: string;
}

export interface ActivitySummary {
  unread: number;
  total: number;
  items: ActivityEvent[];
}

export function useActivitySummary(enabled: boolean) {
  return useQuery({
    queryKey: ["activity", "summary"],
    queryFn: () => api.get<ActivitySummary>("/activity/summary", { limit: 8 }),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useMarkActivityRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ detail: string }>("/activity/read"),
    onSuccess: () => client.invalidateQueries({ queryKey: ["activity"] }),
  });
}

export function timeAgo(iso: string): string {
  const then = new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
