"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ConfirmDeleteModal } from "@/components/common/ConfirmDeleteModal";
import { useFlash } from "@/components/layout/FlashProvider";
import { ApiError, api } from "@/lib/api";
import type { HostedZone } from "@/types/api";

interface Ksk {
  name: string;
  kms_key_alias: string;
  status: string;
  created_at: string;
  key_tag: number;
  algorithm: { number: number; name: string };
  digest_type: { number: number; name: string };
  ds_record: string;
  dnskey_record: string;
  digest: string;
}
interface Dnssec {
  status: "SIGNING" | "NOT_SIGNING";
  ksk: Ksk | null;
  supported: boolean;
}

/** DNSSEC signing for a public hosted zone (simulated key material and DS record). */
export function ZoneDnssecTab({ zone }: { zone: HostedZone }) {
  const flash = useFlash();
  const client = useQueryClient();
  const key = ["hosted-zones", "dnssec", zone.zone_id];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => api.get<Dnssec>(`/hosted-zones/${zone.zone_id}/dnssec`) });
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [kskName, setKskName] = useState("route53_ksk");
  const [alias, setAlias] = useState("alias/route53-dnssec");
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["hosted-zones"] })]);
  const enable = useMutation({ mutationFn: () => api.post<Dnssec>(`/hosted-zones/${zone.zone_id}/dnssec/enable`, { ksk_name: kskName, kms_key_alias: alias }), onSuccess: refresh });
  const disable = useMutation({ mutationFn: () => api.post<Dnssec>(`/hosted-zones/${zone.zone_id}/dnssec/disable`), onSuccess: refresh });

  if (isPending) return <Box padding="l"><Spinner /></Box>;
  if (error || !data) return <Box padding="l"><Alert type="error">Unable to load the DNSSEC status.</Alert></Box>;
  const ksk = data.ksk;

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header
          variant="h3"
          description="DNSSEC adds cryptographic signatures to your records. Keys and signatures are simulated in this console."
          actions={
            data.status === "SIGNING" ? (
              <Button onClick={() => setDisabling(true)}>Disable DNSSEC signing</Button>
            ) : (
              <Button variant="primary" disabled={!data.supported} onClick={() => setEnabling(true)}>Enable DNSSEC signing</Button>
            )
          }
        >
          DNSSEC signing
        </Header>
        {!data.supported && <Alert type="info">DNSSEC signing is only available for public hosted zones.</Alert>}
        <div>
          <Box variant="awsui-key-label">Status</Box>
          <StatusIndicator type={data.status === "SIGNING" ? "success" : "stopped"}>{data.status === "SIGNING" ? "Signing" : "Not signing"}</StatusIndicator>
        </div>
        {ksk && (
          <SpaceBetween size="m">
            <ColumnLayout columns={3} variant="text-grid">
              <div><Box variant="awsui-key-label">Key-signing key</Box><div>{ksk.name}</div></div>
              <div><Box variant="awsui-key-label">KMS key alias</Box><div>{ksk.kms_key_alias}</div></div>
              <div><Box variant="awsui-key-label">Key status</Box><StatusIndicator type="success">Active</StatusIndicator></div>
              <div><Box variant="awsui-key-label">Signing algorithm</Box><div>{ksk.algorithm.number} - {ksk.algorithm.name}</div></div>
              <div><Box variant="awsui-key-label">Digest algorithm</Box><div>{ksk.digest_type.number} - {ksk.digest_type.name}</div></div>
              <div><Box variant="awsui-key-label">Key tag</Box><div>{ksk.key_tag}</div></div>
            </ColumnLayout>
            <div>
              <Box variant="awsui-key-label">DS record (add this at your domain registrar)</Box>
              <div><span className="record-value">{ksk.ds_record}</span> <CopyToClipboard variant="icon" textToCopy={ksk.ds_record} copyButtonAriaLabel="Copy DS record" copySuccessText="DS record copied" copyErrorText="Unable to copy" /></div>
            </div>
            <div>
              <Box variant="awsui-key-label">Public key (DNSKEY)</Box>
              <div><span className="record-value">{ksk.dnskey_record}</span></div>
            </div>
          </SpaceBetween>
        )}
      </SpaceBetween>

      <Modal
        visible={enabling}
        onDismiss={() => { setEnabling(false); enable.reset(); }}
        header={`Enable DNSSEC signing for ${zone.name}`}
        closeAriaLabel="Close dialog"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setEnabling(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={enable.isPending}
                onClick={() => enable.mutate(undefined, { onSuccess: () => { flash("success", `DNSSEC signing was enabled for ${zone.name} (simulated).`); setEnabling(false); } })}
              >
                Enable
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {enable.error && <Alert type="error">{enable.error instanceof ApiError ? enable.error.detail : "Unable to enable DNSSEC."}</Alert>}
          <FormField label="Key-signing key name" description="3-128 letters, digits or underscores."><Input value={kskName} onChange={({ detail }) => setKskName(detail.value)} ariaLabel="Key-signing key name" /></FormField>
          <FormField label="KMS key alias" description="The customer managed key that protects the signing key (simulated)."><Input value={alias} onChange={({ detail }) => setAlias(detail.value)} ariaLabel="KMS key alias" /></FormField>
        </SpaceBetween>
      </Modal>

      <ConfirmDeleteModal
        visible={disabling}
        title={`Disable DNSSEC signing for ${zone.name}?`}
        confirmLabel="Disable"
        loading={disable.isPending}
        error={disable.error instanceof ApiError ? disable.error.detail : null}
        onDismiss={() => { setDisabling(false); disable.reset(); }}
        onConfirm={() => disable.mutate(undefined, { onSuccess: () => { flash("success", `DNSSEC signing was disabled for ${zone.name}.`); setDisabling(false); } })}
      >
        <Box>Remove the DS record at your registrar first, otherwise resolvers that validate DNSSEC will fail to resolve this domain.</Box>
      </ConfirmDeleteModal>
    </Box>
  );
}
