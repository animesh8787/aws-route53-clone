"use client";

import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { Controller, useFieldArray, useFormContext, useWatch, type FieldErrors } from "react-hook-form";

import { RECORD_TYPE_MAP, type RecordFormValues } from "@/lib/record-config";
import { CAA_TAGS } from "@/lib/dns-validation";

type RowKey = "mxRows" | "srvRows" | "caaRows";

interface ColumnSpec {
  key: string;
  label: string;
  placeholder?: string;
  width: number;
  inputMode?: "numeric";
}

const ROW_SPECS: Record<RowKey, { columns: ColumnSpec[]; blank: Record<string, string>; noun: string }> = {
  mxRows: {
    noun: "mail server",
    blank: { priority: "10", server: "" },
    columns: [
      { key: "priority", label: "Priority", placeholder: "10", width: 2, inputMode: "numeric" },
      { key: "server", label: "Mail server", placeholder: "mail.example.com", width: 6 },
    ],
  },
  srvRows: {
    noun: "SRV value",
    blank: { priority: "10", weight: "5", port: "", target: "" },
    columns: [
      { key: "priority", label: "Priority", placeholder: "10", width: 2, inputMode: "numeric" },
      { key: "weight", label: "Weight", placeholder: "5", width: 2, inputMode: "numeric" },
      { key: "port", label: "Port", placeholder: "5060", width: 2, inputMode: "numeric" },
      { key: "target", label: "Target", placeholder: "sip.example.com", width: 4 },
    ],
  },
  caaRows: {
    noun: "CAA value",
    blank: { flags: "0", tag: "issue", value: "" },
    columns: [
      { key: "flags", label: "Flags", placeholder: "0", width: 2, inputMode: "numeric" },
      { key: "tag", label: "Tag", width: 3 },
      { key: "value", label: "Value", placeholder: "letsencrypt.org", width: 5 },
    ],
  },
};

const MODE_TO_ROWS: Record<string, RowKey> = { mx: "mxRows", srv: "srvRows", caa: "caaRows" };

function rowError(errors: FieldErrors<RecordFormValues>, name: RowKey, index: number, key: string): string | undefined {
  const rows = errors[name] as Record<string, { message?: string }>[] | undefined;
  return rows?.[index]?.[key]?.message;
}

function StructuredRows({ name, serverError }: { name: RowKey; serverError?: string }) {
  const { control, formState } = useFormContext<RecordFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name });
  const spec = ROW_SPECS[name];
  const widths = spec.columns.map((c) => ({ colspan: c.width }));

  return (
    <FormField label="Values" description={RECORD_TYPE_MAP[name === "mxRows" ? "MX" : name === "srvRows" ? "SRV" : "CAA"].help} errorText={serverError}>
      <SpaceBetween size="s">
        {fields.map((row, index) => (
          <Grid key={row.id} gridDefinition={[...widths, { colspan: 1 }]} disableGutters={false}>
            {spec.columns.map((col) => (
              <Controller
                key={col.key}
                control={control}
                name={`${name}.${index}.${col.key}` as `mxRows.${number}.priority`}
                render={({ field }) => {
                  const error = rowError(formState.errors, name, index, col.key);
                  return (
                    <FormField label={index === 0 ? col.label : undefined} errorText={error} stretch>
                      {col.key === "tag" ? (
                        <Select
                          selectedOption={{ value: field.value, label: field.value }}
                          options={CAA_TAGS.map((t) => ({ value: t, label: t }))}
                          onChange={({ detail }) => field.onChange(detail.selectedOption.value)}
                          ariaLabel="CAA tag"
                        />
                      ) : (
                        <Input
                          value={field.value}
                          onChange={({ detail }) => field.onChange(detail.value)}
                          onBlur={field.onBlur}
                          placeholder={col.placeholder}
                          inputMode={col.inputMode}
                          invalid={!!error}
                          ariaLabel={`${col.label} ${index + 1}`}
                        />
                      )}
                    </FormField>
                  );
                }}
              />
            ))}
            <div style={{ paddingTop: index === 0 ? 28 : 0 }}>
              <Button
                formAction="none"
                variant="icon"
                iconName="close"
                disabled={fields.length === 1}
                onClick={() => remove(index)}
                ariaLabel={`Remove ${spec.noun} ${index + 1}`}
              />
            </div>
          </Grid>
        ))}
        <div>
          <Button iconName="add-plus" formAction="none" onClick={() => append({ ...spec.blank } as never)}>
            Add another {spec.noun}
          </Button>
        </div>
      </SpaceBetween>
    </FormField>
  );
}

/** The value editor changes with the record type: free lines, a single value, or structured rows. */
export function ValueFields({ serverError }: { serverError?: string }) {
  const { control, formState } = useFormContext<RecordFormValues>();
  const type = useWatch({ control, name: "type" });
  const config = RECORD_TYPE_MAP[type];
  if (!config) return null;
  const rows = MODE_TO_ROWS[config.mode];
  if (rows) return <StructuredRows key={rows} name={rows} serverError={serverError} />;

  return (
    <Controller
      control={control}
      name="valuesText"
      render={({ field }) => {
        const error = formState.errors.valuesText?.message ?? serverError;
        return (
          <FormField label={config.mode === "single" ? "Value" : "Value"} description={config.help} errorText={error} constraintText={config.mode === "lines" ? "Enter multiple values on separate lines." : undefined}>
            {config.mode === "single" ? (
              <Input value={field.value} onChange={({ detail }) => field.onChange(detail.value)} onBlur={field.onBlur} placeholder={config.placeholder} invalid={!!error} />
            ) : (
              <Textarea value={field.value} onChange={({ detail }) => field.onChange(detail.value)} onBlur={field.onBlur} rows={4} placeholder={config.placeholder} invalid={!!error} spellcheck={false} />
            )}
          </FormField>
        );
      }}
    />
  );
}
