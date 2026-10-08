"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Checkbox from "@cloudscape-design/components/checkbox";
import Container from "@cloudscape-design/components/container";
import FileUpload from "@cloudscape-design/components/file-upload";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import Textarea from "@cloudscape-design/components/textarea";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { useFlash } from "@/components/layout/FlashProvider";
import { ErrorState } from "@/components/states/States";
import { useImportZoneFile } from "@/features/dns/hooks";
import { useHostedZone } from "@/features/hosted-zones/hooks";
import { ApiError } from "@/lib/api";
import type { ImportItem, ImportResult } from "@/types/api";

const MAX_BYTES = 1_000_000;
const SAMPLE = `$ORIGIN example.com.
$TTL 3600
@     IN A     192.0.2.10
www   IN CNAME @
@     IN MX    10 mail
mail  IN A     192.0.2.25
@     IN TXT   "v=spf1 mx -all"
`;

const STATUS = {
  ok: <StatusIndicator type="success">Valid</StatusIndicator>,
  error: <StatusIndicator type="error">Error</StatusIndicator>,
  skipped: <StatusIndicator type="pending">Skipped</StatusIndicator>,
} as const;

export default function ImportPage({ params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = use(params);
  const router = useRouter();
  const flash = useFlash();
  const zone = useHostedZone(zoneId);
  const importer = useImportZoneFile(zoneId);
  usePageChrome(
    [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: zone.data?.name ?? zoneId, href: `/hosted-zones/${zoneId}` },
      { text: "Import zone file", href: `/hosted-zones/${zoneId}/import` },
    ],
    "form",
  );

  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | undefined>();
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);

  if (zone.error) return <ErrorState error={zone.error} onRetry={() => zone.refetch()} title="Unable to load hosted zone" />;
  if (!zone.data) return <Spinner size="large" />;

  const edit = (value: string) => {
    setContent(value);
    setPreview(null);
    importer.reset();
  };

  const onFile = async (selected: File[]) => {
    setFiles(selected);
    setFileError(undefined);
    const file = selected[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setFileError("The file is larger than 1 MB.");
      setFiles([]);
      return;
    }
    edit(await file.text());
  };

  const runPreview = () => importer.mutate({ content, dry_run: true, skip_invalid: skipInvalid }, { onSuccess: setPreview });
  const runImport = () =>
    importer.mutate(
      { content, dry_run: false, skip_invalid: skipInvalid },
      {
        onSuccess: (result) => {
          if (result.committed) {
            flash("success", `Imported ${result.created} record${result.created === 1 ? "" : "s"} into ${zone.data.name}.`);
            router.push(`/hosted-zones/${zoneId}`);
          } else {
            setPreview(result);
          }
        },
        onError: () => flash("error", "The zone file could not be imported."),
      },
    );

  const apiError = importer.error instanceof ApiError ? importer.error.detail : importer.error ? "Unable to process the zone file." : null;
  const canImport = !!preview && preview.valid > 0 && (preview.errors === 0 || skipInvalid);

  return (
    <SpaceBetween size="l">
      <Header variant="h1" description="Upload or paste a BIND zone file, review the parsed records, then confirm the import.">
        Import zone file
      </Header>
      {apiError && <Alert type="error" header="Import failed">{apiError}</Alert>}

      <Container header={<Header variant="h2" description="Supported: $ORIGIN, $TTL, @, relative names, A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA. SOA and apex NS are skipped.">1. Provide the zone file</Header>}>
        <SpaceBetween size="m">
          <FormField label="Upload a file" errorText={fileError} constraintText="Plain-text zone file, up to 1 MB.">
            <FileUpload
              value={files}
              onChange={({ detail }) => void onFile(detail.value)}
              accept=".zone,.txt,.db,text/plain"
              i18nStrings={{ uploadButtonText: (multiple) => (multiple ? "Choose files" : "Choose file"), dropzoneText: (multiple) => (multiple ? "Drop files to upload" : "Drop file to upload"), removeFileAriaLabel: (i) => `Remove file ${i + 1}`, limitShowFewer: "Show fewer files", limitShowMore: "Show more files", errorIconAriaLabel: "Error" }}
              showFileLastModified={false}
              showFileSize
            />
          </FormField>
          <FormField label="Or paste the zone file" stretch>
            <Textarea value={content} onChange={({ detail }) => edit(detail.value)} rows={10} placeholder={SAMPLE} spellcheck={false} />
          </FormField>
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" disabled={!content.trim()} loading={importer.isPending && !preview} onClick={runPreview}>Preview import</Button>
            <Button variant="link" onClick={() => edit(SAMPLE)}>Use sample zone file</Button>
          </SpaceBetween>
        </SpaceBetween>
      </Container>

      {preview && (
        <Container
          header={
            <Header
              variant="h2"
              description={`${preview.valid} valid, ${preview.errors} with errors, ${preview.skipped} skipped. Nothing has been saved yet.`}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button onClick={() => router.push(`/hosted-zones/${zoneId}`)}>Cancel</Button>
                  <Button variant="primary" disabled={!canImport} loading={importer.isPending} onClick={runImport}>
                    Import {preview.valid} record{preview.valid === 1 ? "" : "s"}
                  </Button>
                </SpaceBetween>
              }
            >
              2. Review and confirm
            </Header>
          }
        >
          <SpaceBetween size="m">
            {preview.errors > 0 && (
              <Alert type="warning" header={`${preview.errors} record${preview.errors === 1 ? " has" : "s have"} errors`}>
                <SpaceBetween size="xs">
                  <Box>By default the whole import is cancelled if any record is invalid. You can import only the valid records instead.</Box>
                  <Checkbox checked={skipInvalid} onChange={({ detail }) => setSkipInvalid(detail.checked)}>Skip invalid records and import the rest</Checkbox>
                </SpaceBetween>
              </Alert>
            )}
            <Table<ImportItem>
              variant="embedded"
              items={preview.items}
              trackBy={(i) => `${i.line}-${i.name}-${i.type}`}
              columnDefinitions={[
                { id: "status", header: "Status", cell: (i) => STATUS[i.status] },
                { id: "line", header: "Line", cell: (i) => i.line },
                { id: "name", header: "Name", cell: (i) => i.name.replace(/\.$/, "") },
                { id: "type", header: "Type", cell: (i) => i.type },
                { id: "ttl", header: "TTL", cell: (i) => i.ttl || "-" },
                { id: "values", header: "Value", cell: (i) => i.values.map((v) => <span key={v} className="record-value">{v}</span>) },
                { id: "message", header: "Message", cell: (i) => i.message ?? "-" },
              ]}
              empty={<Box textAlign="center" color="text-body-secondary">No records were found in the file.</Box>}
            />
          </SpaceBetween>
        </Container>
      )}
    </SpaceBetween>
  );
}
