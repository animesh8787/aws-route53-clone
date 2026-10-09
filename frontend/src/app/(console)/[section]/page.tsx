"use client";

import { notFound } from "next/navigation";
import { use } from "react";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { getResourceConfig } from "@/features/resources/registry";

/** A console collection page, rendered from the section's resource config. */
export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const config = getResourceConfig(section);
  if (!config) notFound();
  return <ResourceListPage config={config} />;
}
