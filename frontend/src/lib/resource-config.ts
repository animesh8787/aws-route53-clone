import type { ReactNode } from "react";

export type ResourceItem = Record<string, unknown> & { name: string };
export type FormValues = Record<string, unknown>;

/** Where the options of a select / multiselect come from. */
export type OptionSource = "vpcs" | "private-zones" | "zones" | `resources:${string}` | `list:${string}`;

export interface Option {
  value: string;
  label: string;
  description?: string;
}

interface BaseField {
  name: string; // key in the API payload
  label: string;
  description?: string;
  constraint?: string;
  placeholder?: string;
  /** Only render (and validate) the field when this returns true. */
  visibleWhen?: (values: FormValues) => boolean;
  /** Return an error message, or null when valid. */
  validate?: (value: unknown, values: FormValues) => string | null;
  optional?: boolean;
  disabledOnEdit?: boolean;
  initial?: unknown;
}

export type FieldSpec =
  | (BaseField & { type: "text" | "textarea" | "password" })
  | (BaseField & { type: "number"; min?: number; max?: number })
  | (BaseField & { type: "select"; options?: Option[]; source?: OptionSource; emptyLabel?: string })
  | (BaseField & { type: "multiselect"; options?: Option[]; source?: OptionSource })
  | (BaseField & { type: "toggle"; toggleLabel?: string })
  | (BaseField & { type: "lines" }) // one value per line -> string[]
  | (BaseField & { type: "custom"; render: (props: CustomFieldProps) => ReactNode });

export interface CustomFieldProps {
  value: unknown;
  values: FormValues;
  onChange: (value: unknown) => void;
  error?: string;
  spec: FieldSpec;
}

export interface ColumnSpec {
  id: string;
  header: string;
  cell: (item: ResourceItem) => ReactNode;
  sortKey?: string;
  hidden?: boolean; // hidden by default (still available in preferences)
}

export interface FilterSpec {
  key: string; // data key (sent as filter_<key>) or "status"
  label: string;
  options: Option[];
}

export interface DetailRow {
  label: string;
  value: (item: ResourceItem) => ReactNode;
}

export interface DetailTab {
  id: string;
  label: (item: ResourceItem) => string;
  render: (item: ResourceItem) => ReactNode;
}

export interface ResourceConfig {
  /** Console route segment (also the key in the registry), e.g. "profiles". */
  route: string;
  /** API path of the collection, e.g. "/resources/profile". */
  api: string;
  /** Field of the API object that holds its public id. Defaults to "id". */
  idField?: string;
  title: string; // "Profiles"
  singular: string; // "profile"
  description: string;
  helpTopic?: string;
  /** Content of the contextual help panel opened by the "Info" links. */
  help: { summary: string; points: string[] };
  columns: ColumnSpec[];
  filters?: FilterSpec[];
  searchPlaceholder: string;
  fields: FieldSpec[];
  defaults?: FormValues;
  detailRows: DetailRow[];
  detailTabs?: DetailTab[];
  /** Extra header buttons on the detail page. */
  detailActions?: (item: ResourceItem, refresh: () => void) => ReactNode;
  /** Warning shown in the delete dialog (e.g. consequences). */
  deleteWarning?: (item: ResourceItem) => string | null;
  /** Transform form values before sending (e.g. numbers, nesting). */
  toPayload?: (values: FormValues) => FormValues;
  /** Transform an API object into form values when editing. */
  toForm?: (item: ResourceItem) => FormValues;
  /** Hide the create / edit buttons for read-only collections. */
  readOnly?: boolean;
  createLabel?: string;
  /** Lets one config use a bespoke create page route (e.g. domain registration). */
  createHref?: string;
}

export const idOf = (config: ResourceConfig, item: ResourceItem): string => String(item[config.idField ?? "id"]);
