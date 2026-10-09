"use client";

import Box from "@cloudscape-design/components/box";

import { ConfirmDeleteModal } from "@/components/common/ConfirmDeleteModal";
import { useFlash } from "@/components/layout/FlashProvider";
import { useDeleteResource } from "@/features/resources/api";
import { ApiError } from "@/lib/api";
import { idOf, type ResourceConfig, type ResourceItem } from "@/lib/resource-config";

export function DeleteResourceModal({ config, item, onDismiss, onDeleted }: { config: ResourceConfig; item: ResourceItem | null; onDismiss: () => void; onDeleted?: () => void }) {
  const flash = useFlash();
  const remove = useDeleteResource(config);
  if (!item) return null;
  const warning = config.deleteWarning?.(item);
  const label = config.singular.charAt(0).toUpperCase() + config.singular.slice(1);

  return (
    <ConfirmDeleteModal
      key={idOf(config, item)}
      visible
      title={`Delete ${config.singular}: ${item.name}`}
      requireTyping
      loading={remove.isPending}
      error={remove.error instanceof ApiError ? remove.error.detail : remove.error ? `Unable to delete the ${config.singular}.` : null}
      onDismiss={() => {
        remove.reset();
        onDismiss();
      }}
      onConfirm={() =>
        remove.mutate(item, {
          onSuccess: () => {
            flash("success", `${label} ${item.name} was deleted.`);
            onDismiss();
            onDeleted?.();
          },
        })
      }
    >
      <Box>
        This permanently deletes <Box variant="strong" display="inline">{item.name}</Box> ({idOf(config, item)}). This action cannot be undone.
      </Box>
      {warning && <Box color="text-status-warning">{warning}</Box>}
    </ConfirmDeleteModal>
  );
}
