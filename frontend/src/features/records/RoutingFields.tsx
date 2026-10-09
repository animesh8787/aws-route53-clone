"use client";

import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useQuery } from "@tanstack/react-query";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { useHealthChecks } from "@/features/dns/hooks";
import { useOptions } from "@/features/resources/api";
import { api } from "@/lib/api";
import type { ResourceItem } from "@/lib/resource-config";
import { AWS_REGIONS, CONTINENTS, COUNTRIES, ROUTING_POLICIES, type RecordFormValues } from "@/lib/record-config";

/** IP-based routing: pick a CIDR collection, then one of its locations (or the default). */
function CidrFields() {
  const { control, formState } = useFormContext<RecordFormValues>();
  const collectionId = useWatch({ control, name: "cidrCollectionId" });
  const collections = useOptions("resources:cidr_collection");
  const detail = useQuery({
    queryKey: ["resource", "/resources/cidr_collection", "detail", collectionId],
    queryFn: () => api.get<ResourceItem>(`/resources/cidr_collection/${collectionId}`),
    enabled: !!collectionId,
  });
  const locations = ((detail.data?.locations as { name: string }[] | undefined) ?? []).map((l) => ({ value: l.name, label: l.name }));
  const locationOptions = [{ value: "*", label: "Default (*)", description: "Used when the client IP is in no location" }, ...locations];
  return (
    <ColumnLayout columns={2}>
      <Controller
        control={control}
        name="cidrCollectionId"
        render={({ field }) => (
          <FormField label="CIDR collection" description="Create collections under IP-based routing > CIDR collections." errorText={formState.errors.cidrCollectionId?.message} stretch>
            <Select
              selectedOption={collections.options.find((o) => o.value === field.value) ?? null}
              options={collections.options}
              onChange={({ detail: d }) => field.onChange(d.selectedOption.value ?? "")}
              statusType={collections.loading ? "loading" : "finished"}
              placeholder="Choose a CIDR collection"
              empty="No CIDR collections yet"
              invalid={!!formState.errors.cidrCollectionId}
              ariaLabel="CIDR collection"
            />
          </FormField>
        )}
      />
      <Controller
        control={control}
        name="cidrLocation"
        render={({ field }) => (
          <FormField label="CIDR location" errorText={formState.errors.cidrLocation?.message} stretch>
            <Select
              selectedOption={locationOptions.find((o) => o.value === field.value) ?? { value: field.value, label: field.value }}
              options={locationOptions}
              onChange={({ detail: d }) => field.onChange(d.selectedOption.value ?? "*")}
              statusType={detail.isFetching ? "loading" : "finished"}
              ariaLabel="CIDR location"
            />
          </FormField>
        )}
      />
    </ColumnLayout>
  );
}

/** Fields that appear only for the chosen routing policy (weight, region, failover role, location...). */
export function RoutingFields() {
  const { control, formState } = useFormContext<RecordFormValues>();
  const policy = useWatch({ control, name: "routingPolicy" });
  const geoKind = useWatch({ control, name: "geoKind" });
  const country = useWatch({ control, name: "geoCountry" });
  const health = useHealthChecks();
  const errors = formState.errors;

  const healthOptions = [{ value: "", label: "No health check" }, ...(health.data ?? []).map((h) => ({ value: h.health_check_id, label: h.name, description: `${h.health_check_id} · ${h.status.toLowerCase()}` }))];

  return (
    <SpaceBetween size="l">
      <Controller
        control={control}
        name="routingPolicy"
        render={({ field }) => (
          <FormField label="Routing policy" description="Choose how Route 53 responds to queries for this name.">
            <Select
              selectedOption={ROUTING_POLICIES.filter((p) => p.value === field.value).map((p) => ({ value: p.value, label: p.label, description: p.description }))[0]}
              options={ROUTING_POLICIES.map((p) => ({ value: p.value, label: p.label, description: p.description }))}
              onChange={({ detail }) => field.onChange(detail.selectedOption.value)}
              ariaLabel="Routing policy"
            />
          </FormField>
        )}
      />

      {policy !== "simple" && (
        <ColumnLayout columns={2}>
          <Controller
            control={control}
            name="setIdentifier"
            render={({ field }) => (
              <FormField label="Record ID" description="A unique name that distinguishes this record from others with the same name and type." errorText={errors.setIdentifier?.message} stretch>
                <Input value={field.value} onChange={({ detail }) => field.onChange(detail.value)} onBlur={field.onBlur} invalid={!!errors.setIdentifier} placeholder="e.g. primary-web" />
              </FormField>
            )}
          />
          {policy === "weighted" && (
            <Controller
              control={control}
              name="weight"
              render={({ field }) => (
                <FormField label="Weight" description="A value from 0 to 255. Traffic is proportional to the weight." errorText={errors.weight?.message} stretch>
                  <Input type="number" inputMode="numeric" value={field.value} onChange={({ detail }) => field.onChange(detail.value)} onBlur={field.onBlur} invalid={!!errors.weight} />
                </FormField>
              )}
            />
          )}
          {policy === "latency" && (
            <Controller
              control={control}
              name="region"
              render={({ field }) => (
                <FormField label="Region" description="Queries are routed to the lowest-latency region." errorText={errors.region?.message} stretch>
                  <Select selectedOption={{ value: field.value, label: field.value }} options={AWS_REGIONS.map((r) => ({ value: r, label: r }))} onChange={({ detail }) => field.onChange(detail.selectedOption.value)} ariaLabel="Region" />
                </FormField>
              )}
            />
          )}
          {policy === "failover" && (
            <Controller
              control={control}
              name="failover"
              render={({ field }) => (
                <FormField label="Failover record type" errorText={errors.failover?.message}>
                  <RadioGroup
                    value={field.value}
                    onChange={({ detail }) => field.onChange(detail.value)}
                    items={[
                      { value: "PRIMARY", label: "Primary", description: "Used while it is healthy" },
                      { value: "SECONDARY", label: "Secondary", description: "Used when the primary is unhealthy" },
                    ]}
                  />
                </FormField>
              )}
            />
          )}
          {policy === "multivalue" && (
            <FormField label="Multivalue answer" description="Route 53 returns up to eight healthy records chosen at random. Create one record per answer.">
              <span />
            </FormField>
          )}
        </ColumnLayout>
      )}

      {policy === "ipbased" && <CidrFields />}

      {policy === "geolocation" && (
        <SpaceBetween size="m">
          <Controller
            control={control}
            name="geoKind"
            render={({ field }) => (
              <FormField label="Location" errorText={errors.geoCountry?.message}>
                <RadioGroup
                  value={field.value}
                  onChange={({ detail }) => field.onChange(detail.value)}
                  items={[
                    { value: "default", label: "Default", description: "Used when no other location matches" },
                    { value: "continent", label: "Continent" },
                    { value: "country", label: "Country" },
                  ]}
                />
              </FormField>
            )}
          />
          {geoKind === "continent" && (
            <Controller
              control={control}
              name="geoContinent"
              render={({ field }) => (
                <FormField label="Continent">
                  <Select selectedOption={{ value: field.value, label: CONTINENTS[field.value] ?? field.value }} options={Object.entries(CONTINENTS).map(([v, l]) => ({ value: v, label: l }))} onChange={({ detail }) => field.onChange(detail.selectedOption.value)} ariaLabel="Continent" />
                </FormField>
              )}
            />
          )}
          {geoKind === "country" && (
            <ColumnLayout columns={2}>
              <Controller
                control={control}
                name="geoCountry"
                render={({ field }) => (
                  <FormField label="Country">
                    <Select selectedOption={{ value: field.value, label: COUNTRIES[field.value] ?? field.value }} options={Object.entries(COUNTRIES).map(([v, l]) => ({ value: v, label: l }))} onChange={({ detail }) => field.onChange(detail.selectedOption.value)} filteringType="auto" ariaLabel="Country" />
                  </FormField>
                )}
              />
              {country === "US" && (
                <Controller
                  control={control}
                  name="geoSubdivision"
                  render={({ field }) => (
                    <FormField label={<>Subdivision <i>- optional</i></>} description="US state code, for example CA." errorText={errors.geoSubdivision?.message}>
                      <Input value={field.value} onChange={({ detail }) => field.onChange(detail.value.toUpperCase())} invalid={!!errors.geoSubdivision} placeholder="CA" />
                    </FormField>
                  )}
                />
              )}
            </ColumnLayout>
          )}
        </SpaceBetween>
      )}

      <Controller
        control={control}
        name="healthCheckId"
        render={({ field }) => (
          <FormField label={<>Health check <i>- optional</i></>} description="Unhealthy records are skipped when answering queries (mocked health checks).">
            <Select
              selectedOption={healthOptions.find((o) => o.value === field.value) ?? healthOptions[0]}
              options={healthOptions}
              onChange={({ detail }) => field.onChange(detail.selectedOption.value ?? "")}
              statusType={health.isPending ? "loading" : "finished"}
              ariaLabel="Health check"
            />
          </FormField>
        )}
      />
    </SpaceBetween>
  );
}
