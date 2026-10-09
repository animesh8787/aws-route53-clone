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
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useLogin } from "@/features/auth/hooks";
import { ApiError, api } from "@/lib/api";
import { AWS_LOGO_DARK } from "@/lib/aws-logo";
import type { DashboardSummary } from "@/types/api";

function safeNext(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

/** Like the AWS console: accounts without hosted zones start on the Route 53 home page, others on the dashboard. */
async function landingPage(): Promise<string> {
  try {
    const summary = await api.get<DashboardSummary>("/dashboard/summary");
    return summary.hosted_zones > 0 ? "/dashboard" : "/home";
  } catch {
    return "/dashboard";
  }
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);

  const emailError = touched && !email.trim() ? "Email address is required." : undefined;
  const passwordError = touched && !password ? "Password is required." : undefined;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!email.trim() || !password) return;
    login.mutate({ email, password }, { onSuccess: async () => router.replace(next ?? (await landingPage())) });
  };

  const serverError = login.error instanceof ApiError ? login.error.detail : login.error ? "Unable to sign in. Please try again." : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-layout-main, #f2f3f3)", display: "grid", placeItems: "center", padding: 16 }}>
      <main style={{ width: "100%", maxWidth: 420 }}>
        <SpaceBetween size="l">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AWS_LOGO_DARK} alt="Amazon Web Services" height={44} style={{ display: "block", margin: "0 auto" }} />
          <Container header={<Header variant="h1">Sign in</Header>}>
            <form onSubmit={submit} noValidate>
              <Form
                actions={
                  <Button variant="primary" formAction="submit" loading={login.isPending} fullWidth>
                    Sign in
                  </Button>
                }
              >
                <SpaceBetween size="m">
                  {serverError && (
                    <Alert type="error" header={login.error instanceof ApiError && login.error.status === 429 ? "Too many attempts" : "Authentication failed"}>
                      {serverError}
                    </Alert>
                  )}
                  <FormField label="Email address" errorText={emailError}>
                    <Input
                      type="email"
                      autoComplete="username"
                      autoFocus
                      value={email}
                      onChange={({ detail }) => setEmail(detail.value)}
                      placeholder="demo@example.com"
                      invalid={!!emailError}
                    />
                  </FormField>
                  <FormField label="Password" errorText={passwordError}>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={({ detail }) => setPassword(detail.value)}
                      invalid={!!passwordError}
                    />
                  </FormField>
                </SpaceBetween>
              </Form>
            </form>
          </Container>
          <Box textAlign="center">
            New to this console? <Link href="/signup" onFollow={(e) => { e.preventDefault(); router.push("/signup"); }}>Create an account</Link>
          </Box>
          <Container>
            <SpaceBetween size="xxs">
              <Box variant="h3">Demo account</Box>
              <Box color="text-body-secondary" fontSize="body-s">
                This is a mocked sign-in for the Route 53 console clone.
              </Box>
              <Box fontSize="body-s">
                Email: <Box variant="code">demo@example.com</Box> &nbsp; Password: <Box variant="code">password</Box>
              </Box>
              <Button
                variant="link"
                onClick={() => {
                  setEmail("demo@example.com");
                  setPassword("password");
                }}
              >
                Fill demo credentials
              </Button>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
