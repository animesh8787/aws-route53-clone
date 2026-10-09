"use client";

import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { useFlash } from "@/components/layout/FlashProvider";
import { FieldRenderer } from "@/components/resource/FieldRenderer";
import { ErrorState } from "@/components/states/States";
import { useCreateResource, useResource, useUpdateResource } from "@/features/resources/api";
import { ApiError } from "@/lib/api";
import { idOf, type FormValues, type ResourceConfig, type ResourceItem } from "@/lib/resource-config";

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.filter((x) => String(x).trim() !== "").length === 0);

function initialValues(config: ResourceConfig, item?: ResourceItem, prefill?: URLSearchParams): FormValues {
  const base: FormValues = {};
  for (const f of config.fields) base[f.name] = f.initial ?? (f.type === "multiselect" || f.type === "lines" ? [] : f.type === "toggle" ? false : "");
  Object.assign(base, config.defaults ?? {});
  if (!item) {
    // Create links can prefill fields, e.g. /policy-records/create?policy_id=tp-...
    for (const f of config.fields) {
      const preset = prefill?.get(f.name);
      if (preset) base[f.name] = preset;
    }
    return base;
  }
  const fromItem = config.toForm ? config.toForm(item) : Object.fromEntries(config.fields.map((f) => [f.name, item[f.name]]));
  for (const [k, v] of Object.entries(fromItem)) if (v !== undefined && v !== null) base[k] = v;
  return base;
}

function buildResolver(config: ResourceConfig): Resolver<FormValues> {
  return async (values) => {
    const errors: Record<string, { type: string; message: string }> = {};
    for (const spec of config.fields) {
      if (spec.visibleWhen && !spec.visibleWhen(values)) continue;
      const value = values[spec.name];
      let message: string | null = null;
      if (!spec.optional && spec.type !== "toggle" && spec.type !== "custom" && isEmpty(value)) message = `${spec.label} is required.`;
      else if (!isEmpty(value) || spec.type === "custom") message = spec.validate ? spec.validate(value, values) : null;
      if (message) errors[spec.name] = { type: "validate", message };
    }
    return Object.keys(errors).length ? { values: {}, errors: errors as FieldErrors<FormValues> } : { values, errors: {} };
  };
}

function toPayload(config: ResourceConfig, values: FormValues): FormValues {
  const out: FormValues = {};
  for (const spec of config.fields) {
    if (spec.visibleWhen && !spec.visibleWhen(values)) continue;
    const v = values[spec.name];
    if (spec.type === "number") out[spec.name] = isEmpty(v) ? null : Number(v);
    else if (spec.type === "lines") out[spec.name] = (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);
    else if (typeof v === "string") out[spec.name] = v.trim();
    else out[spec.name] = v;
  }
  return config.toPayload ? config.toPayload(out) : out;
}

/** Create / edit form generated from the resource config. */
export function ResourceFormPage({ config, id }: { config: ResourceConfig; id?: string }) {
  const router = useRouter();
  const flash = useFlash();
  const editing = !!id;
  const existing = useResource(config, id ?? "");
  usePageChrome(
    [
      { text: config.title, href: `/${config.route}` },
      ...(editing ? [{ text: existing.data?.name ?? id ?? "", href: `/${config.route}/${id}` }] : []),
      { text: editing ? "Edit" : `Create ${config.singular}`, href: `/${config.route}/${editing ? `${id}/edit` : "create"}` },
    ],
    "form",
  );

  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} title={`Unable to load ${config.singular}`} />;
  if (editing && !existing.data) return <Spinner size="large" />;
  const loaded = editing ? existing.data : undefined;
  return <FormBody key={loaded ? String(loaded.updated_at ?? "") : "new"} config={config} item={loaded} id={id} router={router} flash={flash} />;
}

function FormBody({ config, item, id, router, flash }: { config: ResourceConfig; item?: ResourceItem; id?: string; router: ReturnType<typeof useRouter>; flash: ReturnType<typeof useFlash> }) {
  const editing = !!item;
  const create = useCreateResource(config);
  const update = useUpdateResource(config, id ?? "");
  const resolver = useMemo(() => buildResolver(config), [config]);
  const prefill = useSearchParams();
  const form = useForm<FormValues>({ resolver, defaultValues: initialValues(config, item, prefill), mode: "onTouched" });
  const values = useWatch({ control: form.control }) as FormValues;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const label = config.singular.charAt(0).toUpperCase() + config.singular.slice(1);

  const submit = form.handleSubmit(async (formValues) => {
    setSubmitError(null);
    setSaving(true);
    try {
      const body = toPayload(config, formValues);
      const saved = editing ? await update.mutateAsync(body) : await create.mutateAsync(body);
      flash("success", `${label} ${saved.name} was ${editing ? "updated" : "created"} successfully.`);
      router.push(`/${config.route}/${idOf(config, saved)}`);
    } catch (error) {
      if (error instanceof ApiError) {
        const byField = new Map<string, string[]>();
        for (const err of error.errors) {
          const target = err.field.split(".")[0].split("[")[0];
          if (config.fields.some((f) => f.name === target)) byField.set(target, [...(byField.get(target) ?? []), err.message]);
        }
        let handled = 0;
        for (const [target, messages] of byField) {
          form.setError(target, { message: [...new Set(messages)].join("\n") });
          handled += messages.length;
        }
        setSubmitError(handled && handled === error.errors.length && handled > 1 ? "Some values need your attention. Fix the highlighted fields and try again." : error.detail);
      } else {
        setSubmitError(`Unable to save the ${config.singular}. Please try again.`);
      }
    } finally {
      setSaving(false);
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Form
        variant="full-page"
        header={<Header variant="h1" description={config.description}>{editing ? `Edit ${config.singular}` : `Create ${config.singular}`}</Header>}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" formAction="none" disabled={saving} onClick={() => router.push(editing ? `/${config.route}/${id}` : `/${config.route}`)}>Cancel</Button>
            <Button variant="primary" formAction="submit" loading={saving}>{editing ? "Save changes" : `Create ${config.singular}`}</Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {submitError && <Alert type="error" header={`Unable to ${editing ? "save" : "create"} ${config.singular}`}>{submitError}</Alert>}
          <Container header={<Header variant="h2">{label} configuration</Header>}>
            <SpaceBetween size="l">
              {config.fields.map((spec) =>
                spec.visibleWhen && !spec.visibleWhen(values) ? null : (
                  <Controller
                    key={spec.name}
                    control={form.control}
                    name={spec.name}
                    render={({ field, fieldState }) => (
                      <FieldRenderer spec={spec} value={field.value} values={values} error={fieldState.error?.message} editing={editing} onChange={field.onChange} onBlur={field.onBlur} />
                    )}
                  />
                ),
              )}
            </SpaceBetween>
          </Container>
          {form.formState.isSubmitted && !form.formState.isValid && <Alert type="error">Fix the highlighted fields and try again.</Alert>}
        </SpaceBetween>
      </Form>
    </form>
  );
}
