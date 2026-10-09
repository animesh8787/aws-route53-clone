"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useFlash } from "@/components/layout/FlashProvider";
import { ApiError, api } from "@/lib/api";
import type { ResourceItem } from "@/lib/resource-config";
import type { Page } from "@/types/api";

const DISMISS_KEY = "r53-premium-banner-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** The blue announcement banner at the top of the Registered domains page. */
export function PremiumDomainsBanner() {
  const router = useRouter();
  const [hidden, setHidden] = useState(() => typeof window !== "undefined" && wasDismissed());
  if (hidden) return null;
  return (
    <Alert
      type="info"
      dismissible
      onDismiss={() => {
        setHidden(true);
        try {
          localStorage.setItem(DISMISS_KEY, "1");
        } catch {
          /* storage unavailable */
        }
      }}
      header="Premium domains now available in Amazon Route 53"
      action={<Button onClick={() => router.push("/registered-domains/register")}>Search for a premium domain</Button>}
    >
      You can now register, transfer, and renew premium domains. Search for a premium domain to get started.
    </Alert>
  );
}

const csvCell = (v: unknown) => {
  const text = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV of every charged domain operation (registrations, renewals, transfers). */
export function DownloadBillingReport() {
  const flash = useFlash();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const all: ResourceItem[] = [];
      for (let page = 1; page <= 10; page++) {
        const result = await api.get<Page<ResourceItem>>("/resources/domain_request", { page, page_size: 100, sort: "created_at", order: "desc" });
        all.push(...result.items);
        if (page >= result.pages) break;
      }
      const charged = all.filter((r) => Number(r.price) > 0);
      const rows = [["Operation ID", "Domain name", "Operation", "Status", "Submitted (UTC)", "Amount (USD)"], ...charged.map((r) => [r.id, r.domain_name, r.request_type, r.status, r.submitted_at, Number(r.price).toFixed(2)])];
      const total = charged.reduce((sum, r) => sum + Number(r.price), 0);
      rows.push(["", "", "", "", "Total", total.toFixed(2)]);
      const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `route53-domains-billing-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      flash("success", `Billing report downloaded (${charged.length} charge${charged.length === 1 ? "" : "s"}, simulated prices).`);
    } catch (error) {
      flash("error", error instanceof ApiError ? error.detail : "The billing report could not be created.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button iconName="download" loading={busy} onClick={() => void download()}>
      Download billing report
    </Button>
  );
}

/** "Transfer in" menu: transfer one domain (name + authorization code) or several at once. */
export function TransferInButton({ onDone }: { onDone: () => void }) {
  const flash = useFlash();
  const client = useQueryClient();
  const [mode, setMode] = useState<"single" | "multiple" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [bulk, setBulk] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bulkResults, setBulkResults] = useState<string[]>([]);

  const close = () => {
    setMode(null);
    setName("");
    setCode("");
    setBulk("");
    setErrors({});
    setBulkResults([]);
  };

  const transfer = useMutation({ mutationFn: (body: { name: string; auth_code: string }) => api.post<ResourceItem>("/domains/transfer-in", body) });

  const finish = (count: number) => {
    void client.invalidateQueries({ queryKey: ["resources"] });
    flash("success", `Transfer requested for ${count} domain${count === 1 ? "" : "s"}. Track progress on the Requests page.`);
    onDone();
    close();
  };

  const submitSingle = () =>
    transfer.mutate(
      { name, auth_code: code },
      {
        onSuccess: () => finish(1),
        onError: (e) => setErrors(e instanceof ApiError ? Object.fromEntries((e.errors.length ? e.errors : [{ field: "name", message: e.detail }]).map((x) => [x.field, x.message])) : { name: "Transfer failed." }),
      },
    );

  const submitMultiple = async () => {
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return setErrors({ bulk: "Enter at least one line: domain name, authorization code." });
    const results: string[] = [];
    let ok = 0;
    for (const line of lines.slice(0, 20)) {
      const [domain, auth = ""] = line.split(/[,\s]+/);
      try {
        await transfer.mutateAsync({ name: domain, auth_code: auth });
        ok += 1;
        results.push(`${domain}: transfer requested`);
      } catch (e) {
        results.push(`${domain}: ${e instanceof ApiError ? e.detail : "failed"}`);
      }
    }
    if (ok === lines.length) finish(ok);
    else {
      setBulkResults(results);
      if (ok) onDone();
    }
  };

  return (
    <>
      <ButtonDropdown
        variant="primary"
        items={[
          { id: "single", text: "Single domain" },
          { id: "multiple", text: "Multiple domains" },
        ]}
        onItemClick={({ detail }) => setMode(detail.id as "single" | "multiple")}
      >
        Transfer in
      </ButtonDropdown>
      <Modal
        visible={mode !== null}
        onDismiss={close}
        header={mode === "multiple" ? "Transfer multiple domains" : "Transfer a domain"}
        closeAriaLabel="Close dialog"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" loading={transfer.isPending} onClick={() => (mode === "multiple" ? void submitMultiple() : submitSingle())}>
                Request transfer
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box color="text-body-secondary">
            Unlock the domain at your current registrar and get its authorization code first. The transfer stays in progress until that registrar approves it
            (simulated in this console).
          </Box>
          {mode === "multiple" ? (
            <FormField label="Domains" description="One per line: domain name, then its authorization code (up to 20)." errorText={errors.bulk}>
              <Textarea value={bulk} onChange={({ detail }) => setBulk(detail.value)} rows={6} placeholder={"store.com, Ab12-cd34\nshop.net, Zz98!xy"} ariaLabel="Domains to transfer" />
            </FormField>
          ) : (
            <>
              <FormField label="Domain name" errorText={errors.name}>
                <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder="example.com" ariaLabel="Domain name to transfer" />
              </FormField>
              <FormField label="Authorization code" description="Also called an auth code or EPP code." errorText={errors.auth_code}>
                <Input value={code} onChange={({ detail }) => setCode(detail.value)} ariaLabel="Authorization code" />
              </FormField>
            </>
          )}
          {bulkResults.length > 0 && (
            <Alert type="warning" header="Some transfers were not requested">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {bulkResults.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Alert>
          )}
        </SpaceBetween>
      </Modal>
    </>
  );
}
