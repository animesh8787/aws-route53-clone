"use client";

import Spinner from "@cloudscape-design/components/spinner";
import { useRouter } from "next/navigation";
import { use } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { useFlash } from "@/components/layout/FlashProvider";
import { ErrorState } from "@/components/states/States";
import { useHostedZone } from "@/features/hosted-zones/hooks";
import { RecordForm } from "@/features/records/RecordForm";
import { useCreateRecord } from "@/features/records/hooks";

export default function CreateRecordPage({ params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = use(params);
  const router = useRouter();
  const flash = useFlash();
  const zone = useHostedZone(zoneId);
  const create = useCreateRecord(zoneId);
  usePageChrome(
    [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: zone.data?.name ?? zoneId, href: `/hosted-zones/${zoneId}` },
      { text: "Create record", href: `/hosted-zones/${zoneId}/records/create` },
    ],
    "form",
  );

  if (zone.error) return <ErrorState error={zone.error} onRetry={() => zone.refetch()} title="Unable to load hosted zone" />;
  if (!zone.data) return <Spinner size="large" />;

  return (
    <RecordForm
      zone={zone.data}
      title="Create record"
      description={`Create a DNS record in ${zone.data.name}.`}
      submitLabel="Create record"
      onCancel={() => router.push(`/hosted-zones/${zoneId}`)}
      onSubmit={async (input) => {
        const record = await create.mutateAsync(input);
        flash("success", `Record ${record.name.replace(/\.$/, "")} (${record.type}) was created successfully.`);
        router.push(`/hosted-zones/${zoneId}`);
      }}
    />
  );
}
