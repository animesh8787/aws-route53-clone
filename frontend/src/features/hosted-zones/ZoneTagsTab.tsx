"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useFlash } from "@/components/layout/FlashProvider";
import { RowsEditor } from "@/components/resource/RowsEditor";
import { ApiError, api } from "@/lib/api";
import type { HostedZone } from "@/types/api";

type Tag = { key: string; value: string };

function validate(tags: Tag[]): string | null {
  const keys = new Set<string>();
  if (tags.length > 50) return "A hosted zone can have at most 50 tags.";
  for (const [i, t] of tags.entries()) {
    const key = t.key.trim();
    if (!key) return `Tag ${i + 1}: enter a key.`;
    if (key.length > 128) return `Tag ${i + 1}: the key can have at most 128 characters.`;
    if (key.toLowerCase().startsWith("aws:")) return `Tag ${i + 1}: keys starting with 'aws:' are reserved.`;
    if (keys.has(key)) return `Tag ${i + 1}: duplicate key '${key}'.`;
    if (t.value.length > 256) return `Tag ${i + 1}: the value can have at most 256 characters.`;
    if (!/^[\w\s.:/=+@-]*$/.test(key + t.value)) return `Tag ${i + 1}: use letters, digits, spaces and + - = . _ : / @ only.`;
    keys.add(key);
  }
  return null;
}

/** Key/value tags on a hosted zone: view, then edit-in-place with validation. */
export function ZoneTagsTab({ zone }: { zone: HostedZone }) {
  const flash = useFlash();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (tags: Tag[]) => api.put<{ tags: Tag[] }>(`/hosted-zones/${zone.zone_id}/tags`, { tags }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["hosted-zones"] }),
  });
  const tags = zone.tags ?? [];

  const start = () => {
    setDraft(tags.map((t) => ({ ...t })));
    setError(null);
    setEditing(true);
  };
  const submit = () => {
    const problem = validate(draft);
    if (problem) return setError(problem);
    setError(null);
    save.mutate(draft, {
      onSuccess: (res) => {
        flash("success", `Tags updated for ${zone.name} (${res.tags.length}).`);
        setEditing(false);
      },
      onError: (e) => setError(e instanceof ApiError ? e.detail : "Unable to save the tags."),
    });
  };

  if (editing) {
    return (
      <Box padding="l">
        <SpaceBetween size="m">
          <Header variant="h3" description="Tags help you organise and track hosted zones. Up to 50 tags." actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" formAction="none" loading={save.isPending} onClick={submit}>Save changes</Button></SpaceBetween>}>
            Manage tags
          </Header>
          {error && <Alert type="error">{error}</Alert>}
          <RowsEditor
            label="Tags"
            rows={draft}
            columns={[
              { key: "key", label: "Key", type: "text", width: "2fr", placeholder: "Environment" },
              { key: "value", label: "Value", type: "text", width: "3fr", placeholder: "production" },
            ]}
            blank={{ key: "", value: "" }}
            addLabel="Add tag"
            rowNoun="tag"
            onChange={(rows) => setDraft(rows as Tag[])}
          />
        </SpaceBetween>
      </Box>
    );
  }

  return (
    <Table
      variant="embedded"
      items={tags}
      trackBy="key"
      header={<Header variant="h3" counter={`(${tags.length})`} actions={<Button onClick={start}>Manage tags</Button>}>Tags</Header>}
      columnDefinitions={[
        { id: "key", header: "Key", cell: (t) => t.key },
        { id: "value", header: "Value", cell: (t) => t.value || "-" },
      ]}
      empty={
        <Box textAlign="center" padding="m">
          <SpaceBetween size="xs">
            <b>No tags</b>
            <span>No tags are associated with this hosted zone.</span>
            <Button onClick={start}>Add tags</Button>
          </SpaceBetween>
        </Box>
      }
    />
  );
}
