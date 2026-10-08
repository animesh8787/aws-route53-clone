"use client";

import Box from "@cloudscape-design/components/box";

import { ConfirmDeleteModal } from "@/components/common/ConfirmDeleteModal";
import { useFlash } from "@/components/layout/FlashProvider";
import { useDeleteZone } from "@/features/hosted-zones/hooks";
import { ApiError } from "@/lib/api";
import type { HostedZone } from "@/types/api";

/** Zones that still hold user records need an explicit "delete records too" acknowledgement. */
export function DeleteZoneModal({ zone, onDismiss, onDeleted }: { zone: HostedZone | null; onDismiss: () => void; onDeleted?: () => void }) {
  const flash = useFlash();
  const remove = useDeleteZone();
  if (!zone) return null;
  const userRecords = Math.max(zone.record_count - 2, 0);

  return (
    <ConfirmDeleteModal
      key={zone.zone_id}
      visible
      title={`Delete hosted zone: ${zone.name}`}
      requireTyping
      confirmLabel="Delete"
      loading={remove.isPending}
      forceWarning={userRecords > 0 ? `Also permanently delete the ${userRecords} record${userRecords === 1 ? "" : "s"} in this hosted zone` : undefined}
      error={remove.error instanceof ApiError ? remove.error.detail : remove.error ? "Unable to delete the hosted zone." : null}
      onDismiss={() => {
        remove.reset();
        onDismiss();
      }}
      onConfirm={(force) =>
        remove.mutate(
          { id: zone.zone_id, force },
          {
            onSuccess: () => {
              flash("success", `Hosted zone ${zone.name} was deleted.`);
              onDismiss();
              onDeleted?.();
            },
            onError: () => flash("error", `Unable to delete hosted zone ${zone.name}.`),
          },
        )
      }
    >
      <Box>
        This permanently deletes <Box variant="strong" display="inline">{zone.name}</Box> ({zone.zone_id}). This action cannot be undone.
      </Box>
      {userRecords > 0 && <Box color="text-status-warning">This hosted zone contains records other than the default NS and SOA records.</Box>}
    </ConfirmDeleteModal>
  );
}
