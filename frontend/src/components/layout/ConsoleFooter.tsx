"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Icon from "@cloudscape-design/components/icon";
import Modal from "@cloudscape-design/components/modal";
import RadioGroup from "@cloudscape-design/components/radio-group";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useFlash } from "@/components/layout/FlashProvider";
import { ApiError, api } from "@/lib/api";

type Dialog = "feedback" | "privacy" | "terms" | "cookies" | null;

const STORAGE_KEYS = ["r53-theme", "r53-recent-services", "r53-favorite-services"];

export function FeedbackModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const pathname = usePathname();
  const flash = useFlash();
  const [message, setMessage] = useState("");
  const [sentiment, setSentiment] = useState("positive");
  const send = useMutation({
    mutationFn: () => api.post<{ detail: string }>("/activity/feedback", { message, sentiment, page: pathname }),
    onSuccess: (result) => {
      flash("success", result.detail);
      setMessage("");
      onDismiss();
    },
  });
  const error = send.error instanceof ApiError ? send.error.detail : send.error ? "Feedback could not be sent." : undefined;
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Feedback"
      closeAriaLabel="Close dialog"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" loading={send.isPending} disabled={!message.trim()} onClick={() => send.mutate()}>
              Submit
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <FormField label="How was your experience?">
          <RadioGroup
            value={sentiment}
            onChange={({ detail }) => setSentiment(detail.value)}
            items={[
              { value: "positive", label: "Satisfied" },
              { value: "neutral", label: "Neutral" },
              { value: "negative", label: "Not satisfied" },
            ]}
          />
        </FormField>
        <FormField label="Feedback" description="Your feedback is saved to your account's activity log." errorText={error} constraintText={`${message.length}/2000 characters`}>
          <Textarea value={message} onChange={({ detail }) => setMessage(detail.value.slice(0, 2000))} placeholder="What should we improve?" rows={5} ariaLabel="Feedback" />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function InfoModal({ dialog, onDismiss }: { dialog: Exclude<Dialog, "feedback" | null>; onDismiss: () => void }) {
  const [cleared, setCleared] = useState(false);
  const content = {
    privacy: {
      header: "Privacy",
      body: [
        "This console stores your email address, display name, a bcrypt hash of your password and the DNS resources you create.",
        "Sign-in uses a session cookie that holds a random token; only a hash of the token is stored on the server.",
        "Questions you send to Amazon Q, together with the resource details it needs to answer, are processed by the assistant's language-model provider.",
        "Nothing is sold or shared, and closing your account on the Account page deletes all of your data.",
      ],
    },
    terms: {
      header: "Terms",
      body: [
        "This is an educational clone of the Route 53 console. It is not affiliated with Amazon Web Services.",
        "DNS answers, health checks, domain registrations, prices and other AWS behaviour are simulated: nothing is registered, charged or served on the internet.",
        "The service is provided as is, without warranty. Do not store secrets or personal data in DNS records.",
      ],
    },
    cookies: {
      header: "Cookie preferences",
      body: [
        "Essential: one session cookie keeps you signed in. It cannot be turned off.",
        "Preferences: your visual mode, recently visited and favourite services are kept in this browser's local storage.",
        "No advertising or analytics cookies are used.",
      ],
    },
  }[dialog];
  return (
    <Modal
      visible
      onDismiss={onDismiss}
      header={content.header}
      closeAriaLabel="Close dialog"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            {dialog === "cookies" && (
              <Button
                onClick={() => {
                  STORAGE_KEYS.forEach((k) => {
                    try {
                      localStorage.removeItem(k);
                    } catch {
                      /* storage unavailable */
                    }
                  });
                  setCleared(true);
                }}
              >
                {cleared ? "Preferences cleared" : "Clear saved preferences"}
              </Button>
            )}
            <Button variant="primary" onClick={onDismiss}>
              Close
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="s">
        {content.body.map((p) => (
          <Box key={p}>{p}</Box>
        ))}
      </SpaceBetween>
    </Modal>
  );
}

interface Props {
  onCloudShell: () => void;
  cloudShellOpen: boolean;
  onUnavailable: (name: string) => void;
}

/** Dark footer bar of the console: CloudShell and feedback on the left, legal links on the right. */
export function ConsoleFooter({ onCloudShell, cloudShellOpen, onUnavailable }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  return (
    <>
      <footer className="r53-footer">
        <nav aria-label="Console tools">
          <button type="button" onClick={onCloudShell} aria-pressed={cloudShellOpen}>
            <Icon name="command-prompt" variant="inverted" size="small" /> CloudShell
          </button>
          <button type="button" className="r53-hide-narrow" onClick={() => onUnavailable("Agent Toolkit for AWS")}>
            <Icon name="script" variant="inverted" size="small" /> Agent Toolkit for AWS
          </button>
          <button type="button" onClick={() => setDialog("feedback")}>
            Feedback
          </button>
        </nav>
        <nav aria-label="Legal">
          <span className="r53-footer-copy">© 2026 Route 53 console clone · educational project</span>
          <button type="button" onClick={() => setDialog("privacy")}>
            Privacy
          </button>
          <button type="button" onClick={() => setDialog("terms")}>
            Terms
          </button>
          <button type="button" className="r53-hide-narrow" onClick={() => setDialog("cookies")}>
            Cookie preferences
          </button>
        </nav>
      </footer>
      <FeedbackModal visible={dialog === "feedback"} onDismiss={() => setDialog(null)} />
      {dialog && dialog !== "feedback" && <InfoModal dialog={dialog} onDismiss={() => setDialog(null)} />}
    </>
  );
}
