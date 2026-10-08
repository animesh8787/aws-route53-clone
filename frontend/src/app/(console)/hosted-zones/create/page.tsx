"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { useFlash } from "@/components/layout/FlashProvider";
import { useCreateZone, useMockVpcs } from "@/features/hosted-zones/hooks";
import { ApiError } from "@/lib/api";
import { validateZoneName } from "@/lib/dns-validation";
import { AWS_REGIONS } from "@/lib/record-config";

const schema = z
  .object({
    name: z.string(),
    comment: z.string().max(256, "Description cannot exceed 256 characters."),
    type: z.enum(["public", "private"]),
    region: z.string(),
    vpcId: z.string(),
  })
  .superRefine((v, ctx) => {
    const nameError = validateZoneName(v.name);
    if (nameError) ctx.addIssue({ code: "custom", path: ["name"], message: nameError });
    if (v.type === "private" && !v.vpcId) ctx.addIssue({ code: "custom", path: ["vpcId"], message: "Choose a VPC to associate with the private hosted zone." });
  });

type FormValues = z.infer<typeof schema>;

export default function CreateHostedZonePage() {
  usePageChrome(
    [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: "Create hosted zone", href: "/hosted-zones/create" },
    ],
    "form",
  );
  const router = useRouter();
  const flash = useFlash();
  const create = useCreateZone();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", comment: "", type: "public", region: "us-east-1", vpcId: "" },
    mode: "onTouched",
  });
  const { control, handleSubmit, watch, setError, setValue, formState } = form;
  const type = watch("type");
  const region = watch("region");
  const vpcs = useMockVpcs(region);

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        name: values.name,
        comment: values.comment,
        type: values.type,
        vpc: values.type === "private" ? { vpc_id: values.vpcId, region: values.region } : null,
      },
      {
        onSuccess: (zone) => {
          flash("success", `Hosted zone ${zone.name} was successfully created.`);
          router.push(`/hosted-zones/${zone.zone_id}`);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.errors.some((e) => e.field === "name")) {
            setError("name", { message: error.errors.find((e) => e.field === "name")?.message });
          }
          flash("error", error instanceof ApiError ? error.detail : "Unable to create the hosted zone.", "Hosted zone not created");
        },
      },
    );
  });

  const serverError = create.error instanceof ApiError && !create.error.errors.some((e) => e.field === "name") ? create.error.detail : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Form
        variant="full-page"
        header={
          <Header variant="h1" description="A hosted zone is a container for records that define how to route traffic for a domain and its subdomains.">
            Create hosted zone
          </Header>
        }
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/hosted-zones")}>Cancel</Button>
            <Button variant="primary" formAction="submit" loading={create.isPending}>Create hosted zone</Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {serverError && <Alert type="error" header="Unable to create hosted zone">{serverError}</Alert>}
          <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
            <SpaceBetween size="l">
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Domain name"
                    description="The domain name of the website or application that you want to route traffic for (for example example.com)."
                    constraintText="Use letters, digits, hyphens and dots, for example example.com. A trailing dot is accepted."
                    errorText={fieldState.error?.message}
                  >
                    <Input
                      value={field.value}
                      onChange={({ detail }) => field.onChange(detail.value)}
                      onBlur={field.onBlur}
                      invalid={!!fieldState.error}
                      placeholder="example.com"
                      autoFocus
                      ariaRequired
                    />
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="comment"
                render={({ field, fieldState }) => (
                  <FormField label={<>Description <i>- optional</i></>} description="This value lets you distinguish between hosted zones that have the same name." errorText={fieldState.error?.message} constraintText="The description can have up to 256 characters.">
                    <Textarea value={field.value} onChange={({ detail }) => field.onChange(detail.value)} onBlur={field.onBlur} rows={3} placeholder="The hosted zone is used for…" />
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <FormField label="Type" description="The type indicates whether you want to route traffic on the internet or in an Amazon VPC.">
                    <RadioGroup
                      value={field.value}
                      onChange={({ detail }) => field.onChange(detail.value)}
                      items={[
                        { value: "public", label: "Public hosted zone", description: "A public hosted zone determines how traffic is routed on the internet." },
                        { value: "private", label: "Private hosted zone", description: "A private hosted zone determines how traffic is routed within an Amazon VPC." },
                      ]}
                    />
                  </FormField>
                )}
              />
            </SpaceBetween>
          </Container>

          {type === "private" && (
            <Container header={<Header variant="h2" description="Associate the hosted zone with a VPC (mocked: no AWS resources are created).">VPCs to associate with the hosted zone</Header>}>
              <SpaceBetween size="l">
                <Controller
                  control={control}
                  name="region"
                  render={({ field }) => (
                    <FormField label="Region">
                      <Select
                        selectedOption={{ value: field.value, label: field.value }}
                        options={AWS_REGIONS.map((r) => ({ value: r, label: r }))}
                        onChange={({ detail }) => {
                          field.onChange(detail.selectedOption.value);
                          setValue("vpcId", "");
                        }}
                      />
                    </FormField>
                  )}
                />
                <Controller
                  control={control}
                  name="vpcId"
                  render={({ field, fieldState }) => (
                    <FormField label="VPC ID" errorText={fieldState.error?.message}>
                      <Select
                        selectedOption={vpcs.data?.filter((v) => v.vpc_id === field.value).map((v) => ({ value: v.vpc_id, label: v.vpc_id, description: `${v.name} (${v.cidr})` }))[0] ?? null}
                        options={(vpcs.data ?? []).map((v) => ({ value: v.vpc_id, label: v.vpc_id, description: `${v.name} (${v.cidr})` }))}
                        onChange={({ detail }) => field.onChange(detail.selectedOption.value)}
                        statusType={vpcs.isPending ? "loading" : vpcs.isError ? "error" : "finished"}
                        loadingText="Loading VPCs"
                        errorText="Unable to load VPCs"
                        placeholder="Choose VPC"
                        invalid={!!fieldState.error}
                      />
                    </FormField>
                  )}
                />
              </SpaceBetween>
            </Container>
          )}
          {formState.isSubmitted && !formState.isValid && <Alert type="error">Fix the highlighted fields and try again.</Alert>}
        </SpaceBetween>
      </Form>
    </form>
  );
}
