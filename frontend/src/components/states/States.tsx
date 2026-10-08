"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

import { ApiError } from "@/lib/api";

/** Table empty state: explains what is missing and offers the next action. */
export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <Box textAlign="center" color="inherit" padding={{ vertical: "m" }}>
      <SpaceBetween size="xs">
        <div>
          <Box variant="strong" textAlign="center" color="inherit">
            {title}
          </Box>
          <Box variant="p" padding={{ bottom: "s" }} color="inherit">
            {body}
          </Box>
        </div>
        {actionLabel && <Button onClick={onAction}>{actionLabel}</Button>}
      </SpaceBetween>
    </Box>
  );
}

/** Friendly message for failed requests, with a retry action; never shows raw traces. */
export function ErrorState({ error, onRetry, title = "Unable to load data" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof ApiError && error.status !== 500 ? error.detail : "Something went wrong on our side. Please try again in a moment.";
  return (
    <Alert type="error" header={title} action={onRetry ? <Button onClick={onRetry}>Retry</Button> : undefined}>
      {message}
    </Alert>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <SpaceBetween size="l">
      <Header variant="h1" description="This part of the Route 53 console is outside the scope of this clone.">
        {title}
      </Header>
      <Container>
        <Box textAlign="center" padding={{ vertical: "xxl" }}>
          <SpaceBetween size="s" alignItems="center">
            <StatusIndicator type="pending">Coming soon</StatusIndicator>
            <Box variant="h2">{title} is coming soon</Box>
            <Box color="text-body-secondary">We are still building this feature. Hosted zones and DNS records are fully functional today.</Box>
            <Button href="/hosted-zones" variant="primary">
              Go to hosted zones
            </Button>
          </SpaceBetween>
        </Box>
      </Container>
    </SpaceBetween>
  );
}
