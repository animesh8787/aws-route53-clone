"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type FieldError } from "@/lib/api";
import type { DashboardSummary, HealthCheck, ImportResult, Page, ResolveResponse } from "@/types/api";

export function useHealthChecks() {
  return useQuery({
    queryKey: ["health-checks", "options"],
    queryFn: async () => (await api.get<Page<HealthCheck>>("/health-checks", { page_size: 100 })).items,
  });
}

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardSummary>("/dashboard/summary") });
}

export interface ResolveParams {
  name: string;
  type: string;
  client_region?: string;
  client_country?: string;
  client_continent?: string;
  client_ip?: string;
  source_vpc?: string;
  view?: string;
  seed?: number;
}

export function useResolve() {
  return useMutation({ mutationFn: (p: ResolveParams) => api.get<ResolveResponse>("/dns/resolve", { ...p }) });
}

export function useImportZoneFile(zoneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { content: string; dry_run: boolean; skip_invalid: boolean }) => api.post<ImportResult>(`/hosted-zones/${zoneId}/import`, body),
    onSuccess: (result) => {
      if (result.committed) {
        client.invalidateQueries({ queryKey: ["records"] });
        client.invalidateQueries({ queryKey: ["hosted-zones"] });
        client.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
  });
}

export type { FieldError };
