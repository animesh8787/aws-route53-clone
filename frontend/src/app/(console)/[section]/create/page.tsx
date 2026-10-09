"use client";

import { notFound } from "next/navigation";
import { use } from "react";

import { ResourceFormPage } from "@/components/resource/ResourceFormPage";
import { getResourceConfig } from "@/features/resources/registry";

export default function CreateResourcePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const config = getResourceConfig(section);
  if (!config) notFound();
  return <ResourceFormPage config={config} />;
}
