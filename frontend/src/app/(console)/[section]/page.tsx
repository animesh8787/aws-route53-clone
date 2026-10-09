"use client";

import { notFound } from "next/navigation";
import { use } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { COMING_SOON_TITLES } from "@/components/layout/nav-items";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { ComingSoon } from "@/components/states/States";
import { getResourceConfig } from "@/features/resources/registry";

/** A console collection page: real resource list when the section is implemented, otherwise Coming Soon. */
export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const config = getResourceConfig(section);
  const title = COMING_SOON_TITLES[section];
  usePageChrome(!config && title ? [{ text: title, href: `/${section}` }] : []);
  if (config) return <ResourceListPage config={config} />;
  if (!title) notFound();
  return <ComingSoon title={title} />;
}
