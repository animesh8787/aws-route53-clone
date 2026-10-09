"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDeleteModal } from "@/components/common/ConfirmDeleteModal";
import { usePageChrome } from "@/components/layout/ChromeContext";
import { useFlash } from "@/components/layout/FlashProvider";
import { useAccountData, useAccountSummary, useCloseAccount, useCurrentUser, useUpdateProfile } from "@/features/auth/hooks";
import { ApiError } from "@/lib/api";

const when = (iso?: string | null) => (iso ? new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleString() : "-");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <div>{children}</div>
    </div>
  );
}

export default function AccountPage() {
  usePageChrome([{ text: "Account", href: "/account" }]);
  const router = useRouter();
  const flash = useFlash();
  const { data: user } = useCurrentUser();
  const summary = useAccountSummary();
  const update = useUpdateProfile();
  const data = useAccountData();
  const close = useCloseAccount();
  const [name, setName] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [password, setPassword] = useState("");

  if (!user) return <Spinner size="large" />;
  const current = name ?? user.display_name;
  const nameError = !current.trim() ? "Display name is required." : current.length > 50 ? "Display name can have at most 50 characters." : undefined;

  return (
    <SpaceBetween size="l">
      <Header variant="h1" description="Your profile and the data stored in this account.">Account</Header>

      <Container header={<Header variant="h2">Profile</Header>}>
        <SpaceBetween size="l">
          <ColumnLayout columns={3} variant="text-grid">
            <Field label="Email address">{user.email}</Field>
            <Field label="Account ID">{user.account_id.replace(/(\d{4})(\d{4})(\d{4})/, "$1-$2-$3")}</Field>
            <Field label="Password last changed">{when(user.password_changed_at)}</Field>
            <Field label="Member since">{when(user.created_at)}</Field>
          </ColumnLayout>
          <FormField label="Display name" errorText={nameError} description="Shown in the navigation bar and as the creator of hosted zones.">
            <SpaceBetween direction="horizontal" size="xs">
              <div style={{ width: 320 }}>
                <Input value={current} onChange={({ detail }) => setName(detail.value)} invalid={!!nameError} ariaLabel="Display name" />
              </div>
              <Button
                loading={update.isPending}
                disabled={!!nameError || current.trim() === user.display_name}
                onClick={() => update.mutate(current.trim(), { onSuccess: () => { flash("success", "Your display name was updated."); setName(null); } })}
              >
                Save
              </Button>
            </SpaceBetween>
          </FormField>
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2" description="Everything you create belongs to this account only.">Your data</Header>}>
        <SpaceBetween size="m">
          {summary.data && (
            <ColumnLayout columns={3} variant="text-grid">
              <Field label="Hosted zones">{summary.data.zones}</Field>
              <Field label="Health checks">{summary.data.health_checks}</Field>
              <Field label="Other console resources">{summary.data.resources}</Field>
            </ColumnLayout>
          )}
          {summary.data?.empty ? (
            <SpaceBetween size="xs">
              <Box color="text-body-secondary">This account is empty. Load sample data to explore with realistic zones, records, policies and resolver settings.</Box>
              <div>
                <Button
                  variant="primary"
                  loading={data.load.isPending}
                  onClick={() => data.load.mutate(undefined, { onSuccess: () => { flash("success", "Sample data was loaded."); router.push("/hosted-zones"); }, onError: (e) => flash("error", e instanceof ApiError ? e.detail : "Unable to load sample data.") })}
                >
                  Load sample data
                </Button>
              </div>
            </SpaceBetween>
          ) : (
            <div>
              <Button onClick={() => setClearing(true)}>Clear all data</Button>
            </div>
          )}
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2" description="Permanently delete this account and everything in it.">Close account</Header>}>
        <Button onClick={() => { setPassword(""); setClosing(true); }}>Close account</Button>
      </Container>

      <ConfirmDeleteModal
        visible={clearing}
        title="Clear all data?"
        requireTyping
        confirmLabel="Clear data"
        loading={data.clear.isPending}
        onDismiss={() => setClearing(false)}
        onConfirm={() => data.clear.mutate(undefined, { onSuccess: () => { setClearing(false); flash("success", "All data was removed from your account."); } })}
      >
        <Box>This permanently deletes every hosted zone, record, health check and console resource in this account. Your login and profile stay. This cannot be undone.</Box>
      </ConfirmDeleteModal>

      <Modal
        visible={closing}
        onDismiss={() => { setClosing(false); close.reset(); }}
        header="Close your account?"
        closeAriaLabel="Close dialog"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setClosing(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={close.isPending}
                disabled={!password}
                onClick={() => close.mutate(password, { onSuccess: () => router.replace("/login") })}
              >
                Close account
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Alert type="warning">This permanently deletes your account and all of its data. You will be signed out immediately.</Alert>
          {close.error && <Alert type="error">{close.error instanceof ApiError ? close.error.detail : "Unable to close the account."}</Alert>}
          <FormField label="Confirm with your password">
            <Input type="password" value={password} onChange={({ detail }) => setPassword(detail.value)} autoComplete="current-password" ariaLabel="Password" />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
