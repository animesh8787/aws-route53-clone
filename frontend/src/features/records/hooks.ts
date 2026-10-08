"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { BulkDeleteResult, DnsRecord, Page, RecordInput } from "@/types/api";

export interface RecordListParams {
  q?: string;
  type?: string;
  routing_policy?: string;
  alias?: string;
  sort?: string;
  order?: string;
  page: number;
  page_size: number;
}

export const recordKeys = {
  all: ["records"] as const,
  list: (zoneId: string, p: RecordListParams) => ["records", "list", zoneId, p] as const,
  detail: (id: number) => ["records", "detail", id] as const,
};

export function useRecords(zoneId: string, params: RecordListParams) {
  return useQuery({
    queryKey: recordKeys.list(zoneId, params),
    queryFn: () => api.get<Page<DnsRecord>>(`/hosted-zones/${zoneId}/records`, { ...params }),
    placeholderData: keepPreviousData,
  });
}

export function useRecord(id: number) {
  return useQuery({ queryKey: recordKeys.detail(id), queryFn: () => api.get<DnsRecord>(`/records/${id}`) });
}

/** Records change a zone's record_count, so zone queries are refreshed too. */
function useInvalidate() {
  const client = useQueryClient();
  return () => Promise.all([client.invalidateQueries({ queryKey: recordKeys.all }), client.invalidateQueries({ queryKey: ["hosted-zones"] }), client.invalidateQueries({ queryKey: ["dashboard"] })]);
}

export function useCreateRecord(zoneId: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: RecordInput) => api.post<DnsRecord>(`/hosted-zones/${zoneId}/records`, body), onSuccess: invalidate });
}

export function useUpdateRecord(id: number) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: RecordInput) => api.put<DnsRecord>(`/records/${id}`, body), onSuccess: invalidate });
}

export function useDeleteRecords(zoneId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (ids: number[]) => api.post<BulkDeleteResult>(`/hosted-zones/${zoneId}/records/bulk-delete`, { ids }),
    onSuccess: invalidate,
  });
}
