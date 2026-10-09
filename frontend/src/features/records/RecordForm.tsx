"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Toggle from "@cloudscape-design/components/toggle";
import { useMemo, useState } from "react";
import { Controller, FormProvider, useForm, useWatch, type Resolver } from "react-hook-form";

import { RoutingFields } from "@/features/records/RoutingFields";
import { ValueFields } from "@/features/records/ValueFields";
import { ApiError, type FieldError } from "@/lib/api";
import {
  ALIAS_TARGET_TYPES,
  emptyFormValues,
  formToInput,
  RECORD_TYPE_MAP,
  RECORD_TYPES,
  recordToForm,
  TTL_PRESETS,
  type RecordFormValues,
} from "@/lib/record-config";
import { buildRecordSchema } from "@/lib/record-schema";
import type { DnsRecord, HostedZone, RecordInput } from "@/types/api";

interface Props {
  zone: HostedZone;
  /** When set the form edits this record; name and type are then read-only, as in Route 53. */
  record?: DnsRecord;
  submitLabel: string;
  title: string;
  description: string;
  onSubmit: (input: RecordInput) => Promise<unknown>;
  onCancel: () => void;
}

const SERVER_FIELD_MAP: Record<string, keyof RecordFormValues> = {
  name: "name",
  type: "type",
  ttl: "ttl",
  routing_policy: "routingPolicy",
  set_identifier: "setIdentifier",
  weight: "weight",
  region: "region",
  failover: "failover",
  geo_continent: "geoContinent",
  geo_country: "geoCountry",
  geo_subdivision: "geoSubdivision",
  health_check_id: "healthCheckId",
  alias: "aliasEnabled",
  "alias.target": "aliasTarget",
  "alias.target_type": "aliasTargetType",
};

export function RecordForm({ zone, record, submitLabel, title, description, onSubmit, onCancel }: Props) {
  const schema = useMemo(() => buildRecordSchema(zone.name), [zone.name]);
  const form = useForm<RecordFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<RecordFormValues>,
    defaultValues: record ? recordToForm(record, zone.name) : emptyFormValues(),
    mode: "onTouched",
  });
  const { control, handleSubmit, setValue, setError, formState } = form;
  const [valuesError, setValuesError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const type = useWatch({ control, name: "type" });
  const aliasEnabled = useWatch({ control, name: "aliasEnabled" });
  const aliasTargetType = useWatch({ control, name: "aliasTargetType" });
  const typeConfig = RECORD_TYPE_MAP[type];
  const editing = !!record;
  const isSystem = record?.is_system ?? false;

  const applyServerErrors = (errors: FieldError[]) => {
    let handled = false;
    for (const err of errors) {
      if (err.field === "values" || err.field.startsWith("values[")) {
        setValuesError(err.message);
        handled = true;
        continue;
      }
      const target = SERVER_FIELD_MAP[err.field];
      if (target) {
        setError(target, { message: err.message });
        handled = true;
      }
    }
    return handled;
  };

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    setValuesError(undefined);
    setSaving(true);
    try {
      await onSubmit(formToInput(values));
    } catch (error) {
      if (error instanceof ApiError) {
        const handled = applyServerErrors(error.errors);
        setSubmitError(handled && error.errors.length > 1 ? "Some values need your attention. Fix the highlighted fields and try again." : error.detail);
      } else {
        setSubmitError("Unable to save the record. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate>
        <Form
          variant="full-page"
          header={<Header variant="h1" description={description}>{title}</Header>}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" formAction="none" onClick={onCancel} disabled={saving}>Cancel</Button>
              <Button variant="primary" formAction="submit" loading={saving} disabled={!!record?.policy_record_id}>{submitLabel}</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            {submitError && <Alert type="error" header="Unable to save record">{submitError}</Alert>}
            {record?.policy_record_id && <Alert type="warning" header="Managed by a traffic policy record">This record is created from the policy record {record.policy_record_id}. Change or delete the policy record to modify it.</Alert>}
            {isSystem && <Alert type="info">This is a default {record?.type} record managed by Route 53. You can change its TTL and values, but not its name or type.</Alert>}

            <Container header={<Header variant="h2">{editing ? "Record details" : "Quick create record"}</Header>}>
              <SpaceBetween size="l">
                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <FormField
                      label="Record name"
                      description="Keep blank to create a record for the root domain."
                      constraintText={type === "SRV" ? "For SRV use _service._protocol, for example _sip._tcp." : "Use * as the leftmost label for a wildcard record."}
                      errorText={fieldState.error?.message}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Input
                            value={field.value}
                            onChange={({ detail }) => field.onChange(detail.value)}
                            onBlur={field.onBlur}
                            disabled={editing}
                            invalid={!!fieldState.error}
                            placeholder="subdomain"
                            autoFocus={!editing}
                            ariaLabel="Record name"
                          />
                        </div>
                        <span style={{ whiteSpace: "nowrap" }}>.{zone.name}</span>
                      </div>
                    </FormField>
                  )}
                />

                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <FormField label="Record type" description="The DNS type of this record." constraintText={editing ? "The record type cannot be changed. Delete and recreate the record to use a different type." : undefined}>
                      <Select
                        selectedOption={{ value: field.value, label: field.value, description: typeConfig?.description }}
                        options={RECORD_TYPES.map((t) => ({ value: t.type, label: t.label, description: t.description }))}
                        onChange={({ detail }) => {
                          const next = detail.selectedOption.value as RecordFormValues["type"];
                          field.onChange(next);
                          setValuesError(undefined);
                          if (!RECORD_TYPE_MAP[next].supportsAlias) setValue("aliasEnabled", false);
                        }}
                        disabled={editing}
                        ariaLabel="Record type"
                      />
                    </FormField>
                  )}
                />

                {typeConfig?.supportsAlias && !isSystem && (
                  <Controller
                    control={control}
                    name="aliasEnabled"
                    render={({ field }) => (
                      <Toggle checked={field.value} onChange={({ detail }) => field.onChange(detail.checked)} description="Route traffic to an AWS resource or another record in this hosted zone, without a TTL.">
                        Alias
                      </Toggle>
                    )}
                  />
                )}

                {aliasEnabled && (
                  <SpaceBetween size="l">
                    <Controller
                      control={control}
                      name="aliasTargetType"
                      render={({ field }) => (
                        <FormField label="Route traffic to">
                          <Select
                            selectedOption={ALIAS_TARGET_TYPES.filter((t) => t.value === field.value).map((t) => ({ value: t.value, label: t.label }))[0]}
                            options={ALIAS_TARGET_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                            onChange={({ detail }) => field.onChange(detail.selectedOption.value)}
                            ariaLabel="Alias target type"
                          />
                        </FormField>
                      )}
                    />
                    <Controller
                      control={control}
                      name="aliasTarget"
                      render={({ field, fieldState }) => (
                        <FormField label="Alias target" description={aliasTargetType === "record" ? "Name of an existing record in this hosted zone." : "The DNS name of the AWS resource."} errorText={fieldState.error?.message}>
                          <Input
                            value={field.value}
                            onChange={({ detail }) => field.onChange(detail.value)}
                            onBlur={field.onBlur}
                            invalid={!!fieldState.error}
                            placeholder={ALIAS_TARGET_TYPES.find((t) => t.value === aliasTargetType)?.placeholder}
                          />
                        </FormField>
                      )}
                    />
                    <Controller
                      control={control}
                      name="evaluateTargetHealth"
                      render={({ field }) => (
                        <Toggle checked={field.value} onChange={({ detail }) => field.onChange(detail.checked)} description="Route 53 skips this alias when the target is unhealthy.">
                          Evaluate target health
                        </Toggle>
                      )}
                    />
                  </SpaceBetween>
                )}
                {!aliasEnabled && <ValueFields serverError={valuesError} />}
                {!aliasEnabled && (
                  <Controller
                      control={control}
                      name="ttl"
                      render={({ field, fieldState }) => (
                        <FormField label="TTL (seconds)" description="Recommended values are between 60 and 172800 (two days)." errorText={fieldState.error?.message}>
                          <SpaceBetween direction="horizontal" size="xs">
                            <div style={{ width: 160 }}>
                              <Input type="number" inputMode="numeric" value={field.value} onChange={({ detail }) => field.onChange(detail.value)} onBlur={field.onBlur} invalid={!!fieldState.error} ariaLabel="TTL in seconds" />
                            </div>
                            {TTL_PRESETS.map((p) => (
                              <Button key={p.label} formAction="none" onClick={() => field.onChange(String(p.seconds))}>{p.label}</Button>
                            ))}
                          </SpaceBetween>
                        </FormField>
                      )}
                    />
                )}
              </SpaceBetween>
            </Container>

            {!isSystem && (
              <Container header={<Header variant="h2">Routing</Header>}>
                <RoutingFields />
              </Container>
            )}
            {formState.isSubmitted && !formState.isValid && <Alert type="error">Fix the highlighted fields and try again.</Alert>}
          </SpaceBetween>
        </Form>
      </form>
    </FormProvider>
  );
}
