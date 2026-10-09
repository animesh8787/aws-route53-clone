"use client";

import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";

import { useOptions } from "@/features/resources/api";
import type { Option, OptionSource } from "@/lib/resource-config";

type Row = Record<string, unknown>;

export interface RowColumn {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  width?: string; // CSS grid track, e.g. "2fr"
  placeholder?: string;
  options?: Option[];
  source?: OptionSource;
  /** Hide the cell for rows where this returns false. */
  visibleWhen?: (row: Row) => boolean;
}

interface Props {
  label: React.ReactNode;
  description?: string;
  error?: string;
  rows: Row[];
  columns: RowColumn[];
  blank: Row;
  addLabel: string;
  rowNoun: string;
  onChange: (rows: Row[]) => void;
}

function SelectCell({ column, value, onChange, ariaLabel }: { column: RowColumn; value: string; onChange: (v: string) => void; ariaLabel: string }) {
  const loaded = useOptions(column.source);
  const options = column.options ?? loaded.options;
  return (
    <Select
      selectedOption={options.find((o) => o.value === value) ?? null}
      options={options}
      onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
      statusType={loaded.loading ? "loading" : "finished"}
      placeholder={column.placeholder ?? "Choose"}
      ariaLabel={ariaLabel}
      filteringType={options.length > 8 ? "auto" : "none"}
    />
  );
}

/** Editable list of objects (one row per object) with add / remove, used by several resource forms. */
export function RowsEditor({ label, description, error, rows, columns, blank, addLabel, rowNoun, onChange }: Props) {
  const set = (index: number, key: string, value: unknown) => onChange(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  // Column widths are given as CSS fr values ("2fr"); they become flex-grow factors so cells wrap on narrow screens.
  const grow = (c: RowColumn) => Number.parseFloat(c.width ?? "1") || 1;
  return (
    <FormField label={label} description={description} errorText={error ? <span style={{ whiteSpace: "pre-line" }}>{error}</span> : undefined} stretch>
      <SpaceBetween size="s">
        {rows.map((row, index) => (
          <div key={index} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", paddingBottom: 8, borderBottom: rows.length > 1 && index < rows.length - 1 ? "1px solid var(--color-border-divider-default, #e9ebed)" : undefined }}>
            {columns.map((c) =>
              c.visibleWhen && !c.visibleWhen(row) ? null : (
                <div key={c.key} style={{ flex: `${grow(c)} 1 ${grow(c) > 1.5 ? 200 : 120}px`, minWidth: 0 }}>
                  <FormField label={c.label}>
                    {c.type === "select" ? (
                      <SelectCell column={c} value={String(row[c.key] ?? "")} onChange={(v) => set(index, c.key, v)} ariaLabel={`${c.label} ${index + 1}`} />
                    ) : (
                      <Input
                        type={c.type === "number" ? "number" : "text"}
                        inputMode={c.type === "number" ? "numeric" : undefined}
                        value={String(row[c.key] ?? "")}
                        onChange={({ detail }) => set(index, c.key, c.type === "number" ? (detail.value === "" ? "" : Number(detail.value)) : detail.value)}
                        placeholder={c.placeholder}
                        ariaLabel={`${c.label} ${index + 1}`}
                      />
                    )}
                  </FormField>
                </div>
              ),
            )}
            <Button variant="icon" iconName="close" formAction="none" ariaLabel={`Remove ${rowNoun} ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))} />
          </div>
        ))}
        <div>
          <Button iconName="add-plus" formAction="none" onClick={() => onChange([...rows, { ...blank }])}>{addLabel}</Button>
        </div>
      </SpaceBetween>
    </FormField>
  );
}
