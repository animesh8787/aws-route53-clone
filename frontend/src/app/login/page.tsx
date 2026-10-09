"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useLogin } from "@/features/auth/hooks";
import { ApiError, api } from "@/lib/api";
import { AWS_LOGO_WHITE } from "@/lib/aws-logo";
import type { DashboardSummary } from "@/types/api";

import "../signin.css";

const PROVIDERS = ["Google", "GitHub", "Apple", "Amazon", "IAM user"];

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
  const [provider, setProvider] = useState<string | null>(null);

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
    <div className="si">
      <header className="si-top">
        <Link href="/" aria-label="Amazon Route 53 home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AWS_LOGO_WHITE} alt="Amazon Web Services" height={44} />
        </Link>
        <div className="si-top-right">
          <span className="si-chip">English ▾</span>
          <Link href="/signup" className="si-chip">
            Sign up
          </Link>
        </div>
      </header>
      <main className="si-card">
        <h1>Sign in to AWS</h1>
        <form onSubmit={submit} noValidate>
          {serverError && (
            <div className="si-alert" role="alert">
              <b>{login.error instanceof ApiError && login.error.status === 429 ? "Too many attempts" : "Authentication failed"}</b>
              <span>{serverError}</span>
            </div>
          )}
          <label htmlFor="si-email">Email address</label>
          <input id="si-email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="demo@example.com" aria-invalid={!!emailError} />
          {emailError && <p className="si-err">{emailError}</p>}
          <label htmlFor="si-password">Password</label>
          <input id="si-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!passwordError} />
          {passwordError && <p className="si-err">{passwordError}</p>}
          <button type="submit" className="si-primary" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="si-or">
          <span>OR</span>
        </div>
        <div className="si-providers">
          {PROVIDERS.map((p) => (
            <button key={p} type="button" onClick={() => setProvider(p)}>
              {p}
            </button>
          ))}
        </div>
        {provider && (
          <p className="si-info" role="status">
            Signing in with {provider} is not available in this console clone. Use your email address and password, or the demo account below.
          </p>
        )}
        <p className="si-terms">
          By continuing and signing in, you acknowledge that this is an educational clone of the AWS console with simulated data. New users can <Link href="/signup">create an account</Link> with an
          email address.
        </p>
        <details className="si-help">
          <summary>Need help signing in?</summary>
          <p>
            Demo account: <code>demo@example.com</code> with password <code>password</code>.
          </p>
          <button
            type="button"
            className="si-link"
            onClick={() => {
              setEmail("demo@example.com");
              setPassword("password");
            }}
          >
            Fill demo credentials
          </button>
        </details>
      </main>
      <footer className="si-foot">
        <Link href="/">Back to the Route 53 page</Link>
        <span>© 2026 Route 53 console clone · educational project · not affiliated with Amazon Web Services</span>
      </footer>
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
