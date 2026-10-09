"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState } from "react";

import { useFlash } from "@/components/layout/FlashProvider";
import { useBulkTtl } from "@/features/records/hooks";
import { ApiError } from "@/lib/api";
import { validateTtl } from "@/lib/dns-validation";
import { DEFAULT_TTL, TTL_PRESETS } from "@/lib/record-config";
import type { DnsRecord } from "@/types/api";

interface Props {
  zoneId: string;
  records: DnsRecord[];
  visible: boolean;
  onDismiss: () => void;
  onDone: () => void;
}

/** Bulk edit: set one TTL on every selected record. Alias records have no TTL and are skipped. */
export function BulkTtlModal({ zoneId, records, visible, onDismiss, onDone }: Props) {
  const flash = useFlash();
  const update = useBulkTtl(zoneId);
  const [ttl, setTtl] = useState(String(DEFAULT_TTL));
  const error = validateTtl(ttl);
  const aliasCount = records.filter((r) => r.alias).length;

  const close = () => {
    update.reset();
    onDismiss();
  };

  const save = () =>
    update.mutate(
      { ids: records.map((r) => r.id), ttl: Number(ttl) },
      {
        onSuccess: (result) => {
          flash("success", `TTL set to ${ttl} seconds on ${result.updated} record${result.updated === 1 ? "" : "s"}.`);
          if (result.skipped.length) flash("warning", `${result.skipped.length} record(s) were skipped: ${result.skipped[0].reason}`);
          onDone();
        },
      },
    );

  return (
    <Modal
      visible={visible}
      onDismiss={close}
      closeAriaLabel="Close dialog"
      header={`Edit TTL for ${records.length} record${records.length === 1 ? "" : "s"}`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={close} disabled={update.isPending}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={update.isPending} disabled={!!error}>Save TTL</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {update.error && <Alert type="error">{update.error instanceof ApiError ? update.error.detail : "Unable to update the TTL."}</Alert>}
        {aliasCount > 0 && <Alert type="info">{aliasCount} selected alias record{aliasCount === 1 ? " has" : "s have"} no TTL and will be skipped.</Alert>}
        <FormField label="TTL (seconds)" description="The new TTL replaces the current value on every selected record." errorText={error ?? undefined}>
          <SpaceBetween direction="horizontal" size="xs">
            <div style={{ width: 160 }}>
              <Input type="number" inputMode="numeric" value={ttl} onChange={({ detail }) => setTtl(detail.value)} invalid={!!error} ariaLabel="New TTL in seconds" autoFocus />
            </div>
            {TTL_PRESETS.map((p) => (
              <Button key={p.label} onClick={() => setTtl(String(p.seconds))}>{p.label}</Button>
            ))}
          </SpaceBetween>
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}
