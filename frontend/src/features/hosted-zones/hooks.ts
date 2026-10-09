"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { HostedZone, HostedZoneInput, MockVpc, Page } from "@/types/api";

export interface ZoneListParams {
  q?: string;
  type?: string;
  sort?: string;
  order?: string;
  page: number;
  page_size: number;
}

export const zoneKeys = {
  all: ["hosted-zones"] as const,
  list: (p: ZoneListParams) => ["hosted-zones", "list", p] as const,
  detail: (id: string) => ["hosted-zones", "detail", id] as const,
};

export function useHostedZones(params: ZoneListParams) {
  return useQuery({
    queryKey: zoneKeys.list(params),
    queryFn: () => api.get<Page<HostedZone>>("/hosted-zones", { ...params }),
    placeholderData: keepPreviousData,
  });
}

export function useHostedZone(id: string) {
  return useQuery({ queryKey: zoneKeys.detail(id), queryFn: () => api.get<HostedZone>(`/hosted-zones/${id}`) });
}

export function useCreateZone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: HostedZoneInput) => api.post<HostedZone>("/hosted-zones", body),
    onSuccess: () => client.invalidateQueries({ queryKey: zoneKeys.all }),
  });
}

export function useUpdateZone(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (comment: string) => api.put<HostedZone>(`/hosted-zones/${id}`, { comment }),
    onSuccess: () => client.invalidateQueries({ queryKey: zoneKeys.all }),
  });
}

export function useDeleteZone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => api.delete<{ detail: string }>(`/hosted-zones/${id}`, { force }),
    onSuccess: (_result, { id }) => {
      // Queries scoped to the deleted zone (detail, DNSSEC, records) would 404 and unmount the page
      // before the success message and redirect run, so they are only marked stale.
      const ofDeletedZone = (key: readonly unknown[]) => key[2] === id && (key[0] === "hosted-zones" || key[0] === "records");
      client.invalidateQueries({ predicate: (q) => ofDeletedZone(q.queryKey), refetchType: "none" });
      return Promise.all([
        client.invalidateQueries({ queryKey: zoneKeys.all, predicate: (q) => !ofDeletedZone(q.queryKey) }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
        client.invalidateQueries({ queryKey: ["activity"] }),
      ]);
    },
  });
}

export function useMockVpcs(region: string) {
  return useQuery({ queryKey: ["vpcs", region], queryFn: () => api.get<MockVpc[]>("/vpcs", { region }) });
}
