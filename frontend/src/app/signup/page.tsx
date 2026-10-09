"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PasswordChecklist } from "@/components/common/PasswordChecklist";
import { useAuthConfig, useRegister } from "@/features/auth/hooks";
import { passwordRules } from "@/features/auth/password-rules";
import { ApiError } from "@/lib/api";
import { AWS_LOGO_DARK } from "@/lib/aws-logo";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

export default function SignupPage() {
  const router = useRouter();
  const config = useAuthConfig();
  const register = useRegister();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const rules = passwordRules(password, email);
  const errors = {
    email: !EMAIL_RE.test(email.trim()) ? "Enter a valid email address." : undefined,
    password: rules.some((r) => !r.met) ? "The password does not meet every requirement." : undefined,
    confirm: confirm !== password ? "The passwords do not match." : undefined,
  };
  const serverFieldError = (field: string) => (register.error instanceof ApiError ? register.error.errors.find((e) => e.field === field)?.message : undefined);
  const serverError = register.error instanceof ApiError && !register.error.errors.length ? register.error.detail : register.error instanceof ApiError && register.error.status === 409 ? register.error.detail : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (errors.email || errors.password || errors.confirm) return;
    register.mutate({ email, password, display_name: name }, { onSuccess: () => router.replace("/home") });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-layout-main, #f2f3f3)", display: "grid", placeItems: "center", padding: 16 }}>
      <main style={{ width: "100%", maxWidth: 460 }}>
        <SpaceBetween size="l">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AWS_LOGO_DARK} alt="Amazon Web Services" height={44} style={{ display: "block", margin: "0 auto" }} />
          <Container header={<Header variant="h1" description="Your account keeps its own hosted zones, records and settings, separate from every other user.">Create an account</Header>}>
            {config.data && !config.data.registration_enabled ? (
              <Alert type="info" header="Registration is closed">New accounts cannot be created on this deployment. Use an existing account to sign in.</Alert>
            ) : (
              <form onSubmit={submit} noValidate>
                <Form actions={<Button variant="primary" formAction="submit" loading={register.isPending} fullWidth>Create account</Button>}>
                  <SpaceBetween size="m">
                    {serverError && <Alert type="error" header="Unable to create the account">{serverError}</Alert>}
                    <FormField label={<>Display name <i>- optional</i></>} errorText={serverFieldError("display_name")}>
                      <Input value={name} onChange={({ detail }) => setName(detail.value)} autoComplete="name" ariaLabel="Display name" />
                    </FormField>
                    <FormField label="Email address" errorText={(touched ? errors.email : undefined) ?? serverFieldError("email")}>
                      <Input type="email" autoComplete="username" value={email} onChange={({ detail }) => setEmail(detail.value)} invalid={touched && !!errors.email} autoFocus ariaLabel="Email address" />
                    </FormField>
                    <FormField label="Password" errorText={touched ? errors.password : undefined} constraintText={undefined}>
                      <SpaceBetween size="xs">
                        <Input type="password" autoComplete="new-password" value={password} onChange={({ detail }) => setPassword(detail.value)} invalid={touched && !!errors.password} ariaLabel="Password" />
                        <PasswordChecklist rules={rules} active={password.length > 0} />
                      </SpaceBetween>
                    </FormField>
                    <FormField label="Confirm password" errorText={touched ? errors.confirm : undefined}>
                      <Input type="password" autoComplete="new-password" value={confirm} onChange={({ detail }) => setConfirm(detail.value)} invalid={touched && !!errors.confirm} ariaLabel="Confirm password" />
                    </FormField>
                  </SpaceBetween>
                </Form>
              </form>
            )}
          </Container>
          <Box textAlign="center">
            Already have an account? <Link href="/login" onFollow={(e) => { e.preventDefault(); router.push("/login"); }}>Sign in</Link>
          </Box>
        </SpaceBetween>
      </main>
    </div>
  );
}
