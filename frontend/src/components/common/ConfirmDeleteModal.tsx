"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Checkbox from "@cloudscape-design/components/checkbox";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState } from "react";

interface Props {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  onConfirm: (force: boolean) => void;
  loading?: boolean;
  confirmLabel?: string;
  /** When set, the user must type "delete" before the button enables (used for zones). */
  requireTyping?: boolean;
  /** Extra warning requiring an explicit acknowledgement checkbox. */
  forceWarning?: string;
  error?: string | null;
  children: React.ReactNode;
}

/** Destructive-action dialog in the Route 53 style: names the target, states the risk, gates the button. */
export function ConfirmDeleteModal({ visible, title, onDismiss, onConfirm, loading, confirmLabel = "Delete", requireTyping, forceWarning, error, children }: Props) {
  const [typed, setTyped] = useState("");
  const [force, setForce] = useState(false);
  const typingOk = !requireTyping || typed.trim().toLowerCase() === "delete";
  const forceOk = !forceWarning || force;

  const close = () => {
    setTyped("");
    setForce(false);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      onDismiss={close}
      closeAriaLabel="Close dialog"
      header={title}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" loading={loading} disabled={!typingOk || !forceOk} onClick={() => onConfirm(force)}>
              {confirmLabel}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {error && <Alert type="error">{error}</Alert>}
        {children}
        {forceWarning && (
          <Alert type="warning">
            <Checkbox checked={force} onChange={({ detail }) => setForce(detail.checked)}>
              {forceWarning}
            </Checkbox>
          </Alert>
        )}
        {requireTyping && (
          <FormField label={<>To confirm deletion, type <i>delete</i> in the field.</>}>
            <Input value={typed} onChange={({ detail }) => setTyped(detail.value)} placeholder="delete" ariaRequired autoFocus />
          </FormField>
        )}
      </SpaceBetween>
    </Modal>
  );
}
