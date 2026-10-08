"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { useState } from "react";

import { useFlash } from "@/components/layout/FlashProvider";
import { useUpdateZone } from "@/features/hosted-zones/hooks";
import { ApiError } from "@/lib/api";
import type { HostedZone } from "@/types/api";

const MAX_COMMENT = 256;

/** Edit the only mutable zone property in Route 53: its description. */
export function EditZoneModal({ zone, onDismiss }: { zone: HostedZone | null; onDismiss: () => void }) {
  if (!zone) return null;
  return <EditZoneForm key={zone.zone_id} zone={zone} onDismiss={onDismiss} />;
}

function EditZoneForm({ zone, onDismiss }: { zone: HostedZone; onDismiss: () => void }) {
  const flash = useFlash();
  const update = useUpdateZone(zone.zone_id);
  const [comment, setComment] = useState(zone.comment);
  const tooLong = comment.length > MAX_COMMENT;

  const save = () =>
    update.mutate(comment, {
      onSuccess: () => {
        flash("success", `Hosted zone ${zone.name} was updated.`);
        onDismiss();
      },
    });

  return (
    <Modal
      visible
      onDismiss={onDismiss}
      closeAriaLabel="Close dialog"
      header={`Edit hosted zone: ${zone.name}`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={update.isPending} disabled={tooLong || comment === zone.comment}>
              Save changes
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {update.error && <Alert type="error">{update.error instanceof ApiError ? update.error.detail : "Unable to update the hosted zone."}</Alert>}
        <FormField
          label="Description"
          description="Optional. A comment that helps you identify this hosted zone."
          constraintText={`${comment.length}/${MAX_COMMENT} characters`}
          errorText={tooLong ? `Description cannot exceed ${MAX_COMMENT} characters.` : undefined}
        >
          <Textarea value={comment} onChange={({ detail }) => setComment(detail.value)} rows={3} />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}
