"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Option, OptionSource, ResourceConfig, ResourceItem } from "@/lib/resource-config";
import { idOf } from "@/lib/resource-config";
import type { HostedZone, MockVpc, Page } from "@/types/api";

export interface ListParams {
  q?: string;
  status?: string;
  sort?: string;
  order?: string;
  page: number;
  page_size: number;
  filters: Record<string, string>;
}

export const resourceKeys = {
  all: (api: string) => ["resource", api] as const,
  list: (api: string, p: ListParams) => ["resource", api, "list", p] as const,
  detail: (api: string, id: string) => ["resource", api, "detail", id] as const,
};

export function useResourceList(config: ResourceConfig, params: ListParams) {
  const { filters, ...rest } = params;
  const query = { ...rest, ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k === "status" || k === "type" ? k : `filter_${k}`, v])) };
  return useQuery({
    queryKey: resourceKeys.list(config.api, params),
    queryFn: () => api.get<Page<ResourceItem>>(config.api, query),
    placeholderData: keepPreviousData,
  });
}

export function useResource(config: ResourceConfig, id: string) {
  return useQuery({ queryKey: resourceKeys.detail(config.api, id), queryFn: () => api.get<ResourceItem>(`${config.api}/${id}`), enabled: id !== "" });
}

function useInvalidateAll() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["resource"] }),
      client.invalidateQueries({ queryKey: ["dashboard"] }),
      client.invalidateQueries({ queryKey: ["activity"] }),
      client.invalidateQueries({ queryKey: ["records"] }),
    ]);
}

export function useCreateResource(config: ResourceConfig) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (body: unknown) => api.post<ResourceItem>(config.api, body), onSuccess: invalidate });
}

export function useUpdateResource(config: ResourceConfig, id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (body: unknown) => api.put<ResourceItem>(`${config.api}/${id}`, body), onSuccess: invalidate });
}

export function useDeleteResource(config: ResourceConfig) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (item: ResourceItem) => api.delete<{ detail: string }>(`${config.api}/${idOf(config, item)}`),
    onSuccess: invalidate,
  });
}

/** Options for select / multiselect fields, loaded from the API on demand. */
export function useOptions(source: OptionSource | undefined): { options: Option[]; loading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ["options", source],
    enabled: !!source && !source.startsWith("list:"),
    queryFn: async (): Promise<Option[]> => {
      if (source === "vpcs") {
        const vpcs = await api.get<MockVpc[]>("/vpcs");
        return vpcs.map((v) => ({ value: v.vpc_id, label: v.vpc_id, description: `${v.name} · ${v.region} · ${v.cidr}` }));
      }
      if (source === "zones") {
        const zones = await api.get<Page<HostedZone>>("/hosted-zones", { page_size: 100 });
        return zones.items.map((z) => ({ value: z.zone_id, label: z.name, description: `${z.type === "private" ? "Private" : "Public"} · ${z.zone_id}` }));
      }
      if (source === "private-zones") {
        const zones = await api.get<Page<HostedZone>>("/hosted-zones", { type: "private", page_size: 100 });
        return zones.items.map((z) => ({ value: z.zone_id, label: z.name, description: z.zone_id }));
      }
      if (source?.startsWith("resources:")) {
        const kinds = source.slice("resources:".length).split(",");
        const pages = await Promise.allSettled(kinds.map((kind) => api.get<Page<ResourceItem>>(`/resources/${kind}`, { page_size: 100 })));
        return pages.flatMap((p) => (p.status === "fulfilled" ? p.value.items : [])).map((r) => ({ value: String(r.id), label: r.name, description: String(r.id) }));
      }
      return [];
    },
    staleTime: 30_000,
  });
  return { options: data ?? [], loading: !!source && !source.startsWith("list:") && isPending };
}
