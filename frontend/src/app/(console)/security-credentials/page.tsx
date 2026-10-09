"use client";

import Alert from "@cloudscape-design/components/alert";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { useState } from "react";

import { PasswordChecklist } from "@/components/common/PasswordChecklist";
import { usePageChrome } from "@/components/layout/ChromeContext";
import { useFlash } from "@/components/layout/FlashProvider";
import { timeAgo } from "@/features/activity/hooks";
import { useChangePassword, useCurrentUser, useRevokeOtherSessions, useRevokeSession, useSessions, type SessionInfo } from "@/features/auth/hooks";
import { passwordRules } from "@/features/auth/password-rules";
import { describeUserAgent } from "@/features/auth/user-agent";
import { ApiError } from "@/lib/api";

export default function SecurityCredentialsPage() {
  usePageChrome([{ text: "Security credentials", href: "/security-credentials" }]);
  const flash = useFlash();
  const { data: user } = useCurrentUser();
  const change = useChangePassword();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const rules = passwordRules(next, user?.email ?? "");
  const errors = {
    current: !current ? "Enter your current password." : undefined,
    next: rules.some((r) => !r.met) ? "The new password does not meet every requirement." : next === current ? "The new password must be different from the current one." : undefined,
    confirm: confirm !== next ? "The passwords do not match." : undefined,
  };
  const serverFieldError = (field: string) => (change.error instanceof ApiError ? change.error.errors.find((e) => e.field === field)?.message : undefined);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (errors.current || errors.next || errors.confirm) return;
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          flash("success", "Password changed. Your other sessions were signed out.");
          setCurrent("");
          setNext("");
          setConfirm("");
          setTouched(false);
        },
      },
    );
  };

  const others = (sessions.data ?? []).filter((s) => !s.is_current).length;

  return (
    <SpaceBetween size="l">
      <Header variant="h1" description="Manage your password and the devices that are signed in to your account.">Security credentials</Header>

      <Container header={<Header variant="h2">Change password</Header>}>
        <form onSubmit={submit} noValidate>
          <Form actions={<Button variant="primary" formAction="submit" loading={change.isPending}>Change password</Button>}>
            <SpaceBetween size="m">
              {change.error instanceof ApiError && !change.error.errors.length && <Alert type="error">{change.error.detail}</Alert>}
              <FormField label="Current password" errorText={(touched ? errors.current : undefined) ?? serverFieldError("current_password")}>
                <Input type="password" autoComplete="current-password" value={current} onChange={({ detail }) => setCurrent(detail.value)} invalid={touched && !!errors.current} ariaLabel="Current password" />
              </FormField>
              <FormField label="New password" errorText={(touched ? errors.next : undefined) ?? serverFieldError("new_password")}>
                <SpaceBetween size="xs">
                  <Input type="password" autoComplete="new-password" value={next} onChange={({ detail }) => setNext(detail.value)} invalid={touched && !!errors.next} ariaLabel="New password" />
                  <PasswordChecklist rules={rules} active={next.length > 0} />
                </SpaceBetween>
              </FormField>
              <FormField label="Confirm new password" errorText={touched ? errors.confirm : undefined}>
                <Input type="password" autoComplete="new-password" value={confirm} onChange={({ detail }) => setConfirm(detail.value)} invalid={touched && !!errors.confirm} ariaLabel="Confirm new password" />
              </FormField>
              <Box color="text-body-secondary" fontSize="body-s">Changing your password signs you out everywhere else.</Box>
            </SpaceBetween>
          </Form>
        </form>
      </Container>

      <Table<SessionInfo>
        header={
          <Header
            variant="h2"
            counter={sessions.data ? `(${sessions.data.length})` : undefined}
            description="Devices and browsers that are currently signed in. Sessions end after 7 days or when you sign out."
            actions={
              <Button
                disabled={others === 0}
                loading={revokeOthers.isPending}
                onClick={() => revokeOthers.mutate(undefined, { onSuccess: (r) => flash("success", r.detail) })}
              >
                Sign out all other sessions
              </Button>
            }
          >
            Active sessions
          </Header>
        }
        loading={sessions.isPending}
        loadingText="Loading sessions"
        items={sessions.data ?? []}
        trackBy="id"
        columnDefinitions={[
          { id: "device", header: "Device", cell: (s) => <span>{describeUserAgent(s.user_agent)} {s.is_current && <Badge color="green">This session</Badge>}</span> },
          { id: "ip", header: "IP address", cell: (s) => s.ip_address || "-" },
          { id: "signed", header: "Signed in", cell: (s) => new Date(s.created_at.endsWith("Z") ? s.created_at : `${s.created_at}Z`).toLocaleString() },
          { id: "seen", header: "Last active", cell: (s) => timeAgo(s.last_seen_at) },
          {
            id: "actions",
            header: "Actions",
            cell: (s) =>
              s.is_current ? (
                "-"
              ) : (
                <Button variant="inline-link" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id, { onSuccess: () => flash("success", "That session was signed out.") })}>
                  Sign out
                </Button>
              ),
          },
        ]}
        empty={<Box textAlign="center">No active sessions.</Box>}
      />
    </SpaceBetween>
  );
}
