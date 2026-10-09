"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";

import { useAssistant, usePageError } from "@/features/assistant/AssistantContext";
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
  usePageError(`${title}: ${message}`);
  return (
    <Alert type="error" header={title} action={<ErrorActions onRetry={onRetry} text={`${title}: ${message}`} />}>
      {message}
    </Alert>
  );
}

/** "Diagnose with Amazon Q" (and Retry) on error alerts, as in the AWS console. */
export function ErrorActions({ onRetry, text }: { onRetry?: () => void; text: string }) {
  const assistant = useAssistant();
  return (
    <SpaceBetween direction="horizontal" size="xs">
      {assistant && (
        <Button iconName="gen-ai" onClick={() => assistant.ask(`Diagnose this error on the page I'm looking at: "${text}"`)}>
          Diagnose with Amazon Q
        </Button>
      )}
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </SpaceBetween>
  );
}
