"use client";

import { notFound } from "next/navigation";
import { use } from "react";

import { ResourceDetailPage } from "@/components/resource/ResourceDetailPage";
import { getResourceConfig } from "@/features/resources/registry";

export default function ResourceDetailRoute({ params }: { params: Promise<{ section: string; id: string }> }) {
  const { section, id } = use(params);
  const config = getResourceConfig(section);
  if (!config) notFound();
  return <ResourceDetailPage config={config} id={id} />;
}
