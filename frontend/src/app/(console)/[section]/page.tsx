"use client";

import { notFound } from "next/navigation";
import { use } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { COMING_SOON_TITLES } from "@/components/layout/nav-items";
import { ComingSoon } from "@/components/states/States";

/** Every console section outside this clone's scope renders one shared Coming Soon page. */
export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const title = COMING_SOON_TITLES[section];
  usePageChrome(title ? [{ text: title, href: `/${section}` }] : []);
  if (!title) notFound();
  return <ComingSoon title={title} />;
}
