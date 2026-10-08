"use client";

import Spinner from "@cloudscape-design/components/spinner";
import { useRouter } from "next/navigation";
import { use } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { useFlash } from "@/components/layout/FlashProvider";
import { ErrorState } from "@/components/states/States";
import { useHostedZone } from "@/features/hosted-zones/hooks";
import { RecordForm } from "@/features/records/RecordForm";
import { useRecord, useUpdateRecord } from "@/features/records/hooks";

export default function EditRecordPage({ params }: { params: Promise<{ zoneId: string; recordId: string }> }) {
  const { zoneId, recordId } = use(params);
  const id = Number(recordId);
  const router = useRouter();
  const flash = useFlash();
  const zone = useHostedZone(zoneId);
  const record = useRecord(id);
  const update = useUpdateRecord(id);
  usePageChrome(
    [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: zone.data?.name ?? zoneId, href: `/hosted-zones/${zoneId}` },
      { text: "Edit record", href: `/hosted-zones/${zoneId}/records/${recordId}/edit` },
    ],
    "form",
  );

  const error = zone.error ?? record.error;
  if (error) return <ErrorState error={error} onRetry={() => { zone.refetch(); record.refetch(); }} title="Unable to load record" />;
  if (!zone.data || !record.data) return <Spinner size="large" />;

  return (
    <RecordForm
      key={record.data.updated_at}
      zone={zone.data}
      record={record.data}
      title="Edit record"
      description={`${record.data.name.replace(/\.$/, "")} · ${record.data.type}`}
      submitLabel="Save"
      onCancel={() => router.push(`/hosted-zones/${zoneId}`)}
      onSubmit={async (input) => {
        const saved = await update.mutateAsync(input);
        flash("success", `Record ${saved.name.replace(/\.$/, "")} (${saved.type}) was updated successfully.`);
        router.push(`/hosted-zones/${zoneId}`);
      }}
    />
  );
}
