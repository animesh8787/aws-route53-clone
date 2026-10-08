"use client";

import type { AppLayoutProps } from "@cloudscape-design/components/app-layout";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface Crumb {
  text: string;
  href: string;
}

export interface Chrome {
  breadcrumbs: Crumb[];
  contentType: AppLayoutProps["contentType"];
}

const DEFAULT: Chrome = { breadcrumbs: [], contentType: "default" };

interface ChromeContextValue {
  chrome: Chrome;
  setChrome: (chrome: Chrome) => void;
}

export const ChromeContext = createContext<ChromeContextValue>({ chrome: DEFAULT, setChrome: () => {} });

export function useChromeState() {
  const [chrome, setChrome] = useState<Chrome>(DEFAULT);
  return useMemo(() => ({ chrome, setChrome }), [chrome]);
}

/**
 * Pages declare their breadcrumb trail and layout width here; the persistent console shell
 * renders it, so the side navigation is not remounted on every navigation.
 */
export function usePageChrome(breadcrumbs: Crumb[], contentType: Chrome["contentType"] = "default") {
  const { setChrome } = useContext(ChromeContext);
  const crumbsKey = JSON.stringify(breadcrumbs);
  useEffect(() => {
    setChrome({ breadcrumbs: JSON.parse(crumbsKey) as Crumb[], contentType });
  }, [crumbsKey, contentType, setChrome]);
}
