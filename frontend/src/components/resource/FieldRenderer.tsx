"use client";

import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Multiselect from "@cloudscape-design/components/multiselect";
import Select from "@cloudscape-design/components/select";
import Textarea from "@cloudscape-design/components/textarea";
import Toggle from "@cloudscape-design/components/toggle";

import { useOptions } from "@/features/resources/api";
import type { FieldSpec, Option } from "@/lib/resource-config";

interface Props {
  spec: FieldSpec;
  value: unknown;
  values: Record<string, unknown>;
  error?: string;
  editing: boolean;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}

function label(spec: FieldSpec) {
  return spec.optional ? (
    <>
      {spec.label} <i>- optional</i>
    </>
  ) : (
    spec.label
  );
}

/** Renders one declarative field spec with its label, help text and error. */
export function FieldRenderer({ spec, value, values, error, editing, onChange, onBlur }: Props) {
  const source = spec.type === "select" || spec.type === "multiselect" ? spec.source : undefined;
  const loaded = useOptions(source);
  const options: Option[] = spec.type === "select" || spec.type === "multiselect" ? (spec.options ?? loaded.options) : [];
  const disabled = !!spec.disabledOnEdit && editing;
  const shownError = error ? <span style={{ whiteSpace: "pre-line" }}>{error}</span> : undefined;

  let control: React.ReactNode;
  switch (spec.type) {
    case "text":
    case "password":
      control = (
        <Input
          type={spec.type === "password" ? "password" : "text"}
          value={String(value ?? "")}
          onChange={({ detail }) => onChange(detail.value)}
          onBlur={onBlur}
          placeholder={spec.placeholder}
          invalid={!!error}
          disabled={disabled}
          ariaLabel={spec.label}
        />
      );
      break;
    case "number":
      control = (
        <Input
          type="number"
          inputMode="numeric"
          value={String(value ?? "")}
          onChange={({ detail }) => onChange(detail.value)}
          onBlur={onBlur}
          placeholder={spec.placeholder}
          invalid={!!error}
          disabled={disabled}
          ariaLabel={spec.label}
        />
      );
      break;
    case "textarea":
    case "lines":
      control = (
        <Textarea
          value={Array.isArray(value) ? (value as string[]).join("\n") : String(value ?? "")}
          onChange={({ detail }) => onChange(spec.type === "lines" ? detail.value.split("\n") : detail.value)}
          onBlur={onBlur}
          placeholder={spec.placeholder}
          invalid={!!error}
          disabled={disabled}
          rows={4}
          spellcheck={false}
          ariaLabel={spec.label}
        />
      );
      break;
    case "select":
      control = (
        <Select
          selectedOption={options.find((o) => o.value === String(value ?? "")) ?? (spec.emptyLabel ? { value: "", label: spec.emptyLabel } : null)}
          options={spec.emptyLabel ? [{ value: "", label: spec.emptyLabel }, ...options] : options}
          onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
          statusType={loaded.loading ? "loading" : "finished"}
          loadingText="Loading options"
          placeholder={spec.placeholder ?? "Choose an option"}
          invalid={!!error}
          disabled={disabled}
          filteringType={options.length > 8 ? "auto" : "none"}
          ariaLabel={spec.label}
        />
      );
      break;
    case "multiselect": {
      const selected = (Array.isArray(value) ? (value as string[]) : []).map((v) => options.find((o) => o.value === v) ?? { value: v, label: v });
      control = (
        <Multiselect
          selectedOptions={selected}
          options={options}
          onChange={({ detail }) => onChange(detail.selectedOptions.map((o) => o.value))}
          statusType={loaded.loading ? "loading" : "finished"}
          loadingText="Loading options"
          placeholder={spec.placeholder ?? "Choose options"}
          invalid={!!error}
          disabled={disabled}
          keepOpen
          tokenLimit={3}
          filteringType={options.length > 8 ? "auto" : "none"}
          ariaLabel={spec.label}
        />
      );
      break;
    }
    case "toggle":
      control = (
        <Toggle checked={!!value} onChange={({ detail }) => onChange(detail.checked)} disabled={disabled}>
          {spec.toggleLabel ?? spec.label}
        </Toggle>
      );
      break;
    case "custom":
      control = spec.render({ value, values, onChange, error, spec });
      break;
  }

  // Custom fields draw their own label, help text and error.
  if (spec.type === "custom") return <>{control}</>;
  if (spec.type === "toggle") {
    return (
      <FormField description={spec.description} errorText={shownError} stretch>
        {control}
      </FormField>
    );
  }
  return (
    <FormField label={label(spec)} description={spec.description} constraintText={spec.constraint} errorText={shownError} stretch>
      {control}
    </FormField>
  );
}
