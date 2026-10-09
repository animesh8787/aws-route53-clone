"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import Toggle from "@cloudscape-design/components/toggle";
import Wizard from "@cloudscape-design/components/wizard";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { useFlash } from "@/components/layout/FlashProvider";
import { ApiError, api } from "@/lib/api";
import { validateInt } from "@/lib/dns-validation";
import { COUNTRIES } from "@/lib/record-config";
import type { ResourceItem } from "@/lib/resource-config";

interface Availability {
  name: string;
  available: boolean;
  price: number | null;
  reason: string | null;
}

const EMPTY_CONTACT = { first_name: "", last_name: "", organization: "", email: "", phone: "", address_line: "", city: "", state: "", zip_code: "", country: "US" };
type Contact = typeof EMPTY_CONTACT;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9 .()-]{6,19}$/;

function contactErrors(c: Contact): Partial<Record<keyof Contact, string>> {
  const e: Partial<Record<keyof Contact, string>> = {};
  if (!c.first_name.trim()) e.first_name = "First name is required.";
  if (!c.last_name.trim()) e.last_name = "Last name is required.";
  if (!EMAIL_RE.test(c.email.trim())) e.email = "Enter a valid email address.";
  if (!PHONE_RE.test(c.phone.trim())) e.phone = "Enter a phone number such as +1 555 0100.";
  if (!c.address_line.trim()) e.address_line = "Address is required.";
  if (!c.city.trim()) e.city = "City is required.";
  if (!c.country) e.country = "Country is required.";
  return e;
}

export default function RegisterDomainPage() {
  usePageChrome(
    [
      { text: "Registered domains", href: "/registered-domains" },
      { text: "Register domain", href: "/registered-domains/register" },
    ],
    "form",
  );
  const router = useRouter();
  const flash = useFlash();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Availability[] | null>(null);
  const [selected, setSelected] = useState<Availability | null>(null);
  const [years, setYears] = useState("1");
  const [options, setOptions] = useState({ auto_renew: true, transfer_lock: true, privacy_protection: true });
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const search = useMutation({ mutationFn: (name: string) => api.get<Availability[]>("/domains/availability", { name }), onSuccess: (r) => { setResults(r); setSelected(null); } });
  const register = useMutation({ mutationFn: (body: unknown) => api.post<ResourceItem>("/resources/domain", body) });

  const errors = contactErrors(contact);
  const yearsError = validateInt(years, "Years", 1, 10);
  const total = selected?.price ? selected.price * (Number(years) || 0) : 0;
  const set = (key: keyof Contact) => (value: string) => setContact((c) => ({ ...c, [key]: value }));

  const submit = () => {
    setServerError(null);
    register.mutate(
      { name: selected?.name, years: Number(years), ...options, contact },
      {
        onSuccess: (domain) => {
          flash("success", `${domain.name} was registered (simulated) and a hosted zone was created for it.`);
          router.push(`/registered-domains/${domain.id}`);
        },
        onError: (e) => setServerError(e instanceof ApiError ? e.detail : "Unable to register the domain."),
      },
    );
  };

  const field = (key: keyof Contact, label: string, optional = false, placeholder?: string) => (
    <FormField label={optional ? <>{label} <i>- optional</i></> : label} errorText={touched ? errors[key] : undefined} stretch>
      <Input value={contact[key]} onChange={({ detail }) => set(key)(detail.value)} placeholder={placeholder} invalid={touched && !!errors[key]} ariaLabel={label} />
    </FormField>
  );

  return (
    <Wizard
      activeStepIndex={step}
      isLoadingNextStep={register.isPending}
      submitButtonText="Register domain (simulated)"
      i18nStrings={{
        stepNumberLabel: (n) => `Step ${n}`,
        collapsedStepsLabel: (n, total) => `Step ${n} of ${total}`,
        skipToButtonLabel: (s) => `Skip to ${s.title}`,
        navigationAriaLabel: "Steps",
        cancelButton: "Cancel",
        previousButton: "Previous",
        nextButton: "Next",
        optional: "optional",
      }}
      onCancel={() => router.push("/registered-domains")}
      onSubmit={submit}
      onNavigate={({ detail }) => {
        if (detail.requestedStepIndex > step) {
          if (step === 0 && !selected) return;
          if (step === 1) {
            setTouched(true);
            if (Object.keys(errors).length || yearsError) return;
          }
        }
        setStep(detail.requestedStepIndex);
      }}
      steps={[
        {
          title: "Search for a domain",
          description: "Check availability. Names and prices are simulated samples.",
          content: (
            <SpaceBetween size="l">
              <Container header={<Header variant="h2">Find a domain name</Header>}>
                <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) search.mutate(query.trim()); }}>
                  <SpaceBetween size="s">
                    <FormField label="Domain name" description="Enter a name such as mycoolidea, or mycoolidea.com." errorText={search.error instanceof ApiError ? search.error.detail : undefined}>
                      <Input value={query} onChange={({ detail }) => setQuery(detail.value)} placeholder="mycoolidea" autoFocus ariaLabel="Domain name" />
                    </FormField>
                    <Button variant="primary" formAction="submit" loading={search.isPending} disabled={!query.trim()}>Search</Button>
                  </SpaceBetween>
                </form>
              </Container>
              {results && (
                <Table
                  header={<Header variant="h2">Availability</Header>}
                  items={results}
                  trackBy="name"
                  selectionType="single"
                  selectedItems={selected ? [selected] : []}
                  onSelectionChange={({ detail }) => setSelected(detail.selectedItems[0] ?? null)}
                  isItemDisabled={(r) => !r.available}
                  ariaLabels={{ selectionGroupLabel: "Domain selection", itemSelectionLabel: (_s, i) => `Select ${i.name}`, allItemsSelectionLabel: () => "Select domain" }}
                  columnDefinitions={[
                    { id: "name", header: "Domain", cell: (r) => r.name },
                    { id: "status", header: "Status", cell: (r) => (r.available ? <StatusIndicator type="success">Available</StatusIndicator> : <StatusIndicator type="error">Unavailable</StatusIndicator>) },
                    { id: "price", header: "Price per year", cell: (r) => (r.price ? `$${r.price.toFixed(2)}` : "-") },
                    { id: "note", header: "Note", cell: (r) => r.reason ?? "" },
                  ]}
                />
              )}
            </SpaceBetween>
          ),
        },
        {
          title: "Contact information",
          description: "The registrant details for the domain.",
          content: (
            <SpaceBetween size="l">
              <Container header={<Header variant="h2">Registration period and options</Header>}>
                <SpaceBetween size="m">
                  <FormField label="Registration period (years)" errorText={touched ? (yearsError ?? undefined) : undefined}>
                    <Input type="number" inputMode="numeric" value={years} onChange={({ detail }) => setYears(detail.value)} invalid={touched && !!yearsError} ariaLabel="Registration years" />
                  </FormField>
                  <Toggle checked={options.auto_renew} onChange={({ detail }) => setOptions((o) => ({ ...o, auto_renew: detail.checked }))}>Auto-renew</Toggle>
                  <Toggle checked={options.transfer_lock} onChange={({ detail }) => setOptions((o) => ({ ...o, transfer_lock: detail.checked }))}>Transfer lock</Toggle>
                  <Toggle checked={options.privacy_protection} onChange={({ detail }) => setOptions((o) => ({ ...o, privacy_protection: detail.checked }))}>Privacy protection</Toggle>
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2">Registrant contact</Header>}>
                <ColumnLayout columns={2}>
                  {field("first_name", "First name")}
                  {field("last_name", "Last name")}
                  {field("organization", "Organization", true)}
                  {field("email", "Email address", false, "you@example.com")}
                  {field("phone", "Phone number", false, "+1 555 0100")}
                  {field("address_line", "Address")}
                  {field("city", "City")}
                  {field("state", "State or province", true)}
                  {field("zip_code", "Postal code", true)}
                  <FormField label="Country" errorText={touched ? errors.country : undefined} stretch>
                    <Select
                      selectedOption={{ value: contact.country, label: COUNTRIES[contact.country] ?? contact.country }}
                      options={Object.entries(COUNTRIES).map(([value, label]) => ({ value, label }))}
                      onChange={({ detail }) => set("country")(detail.selectedOption.value ?? "")}
                      filteringType="auto"
                      ariaLabel="Country"
                    />
                  </FormField>
                </ColumnLayout>
              </Container>
            </SpaceBetween>
          ),
        },
        {
          title: "Review and register",
          content: (
            <SpaceBetween size="l">
              {serverError && <Alert type="error" header="Registration failed">{serverError}</Alert>}
              <Alert type="info">This is a simulation: no payment is taken and no domain is registered anywhere.</Alert>
              <Container header={<Header variant="h2">Order summary</Header>}>
                <ColumnLayout columns={3} variant="text-grid">
                  <div><Box variant="awsui-key-label">Domain</Box><div>{selected?.name}</div></div>
                  <div><Box variant="awsui-key-label">Period</Box><div>{years} year(s)</div></div>
                  <div><Box variant="awsui-key-label">Estimated total</Box><div>${total.toFixed(2)}</div></div>
                  <div><Box variant="awsui-key-label">Auto-renew</Box><div>{options.auto_renew ? "On" : "Off"}</div></div>
                  <div><Box variant="awsui-key-label">Transfer lock</Box><div>{options.transfer_lock ? "On" : "Off"}</div></div>
                  <div><Box variant="awsui-key-label">Privacy protection</Box><div>{options.privacy_protection ? "On" : "Off"}</div></div>
                  <div><Box variant="awsui-key-label">Registrant</Box><div>{contact.first_name} {contact.last_name}</div></div>
                  <div><Box variant="awsui-key-label">Email</Box><div>{contact.email}</div></div>
                  <div><Box variant="awsui-key-label">Hosted zone</Box><div>A public hosted zone for {selected?.name} is created automatically.</div></div>
                </ColumnLayout>
              </Container>
            </SpaceBetween>
          ),
        },
      ]}
    />
  );
}
