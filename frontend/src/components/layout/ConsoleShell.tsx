"use client";

import AppLayoutToolbar from "@cloudscape-design/components/app-layout-toolbar";
import Box from "@cloudscape-design/components/box";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Modal from "@cloudscape-design/components/modal";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import Spinner from "@cloudscape-design/components/spinner";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { ChromeContext, useChromeState } from "@/components/layout/ChromeContext";
import { ConsoleFooter, FeedbackModal } from "@/components/layout/ConsoleFooter";
import { FlashMessages } from "@/components/layout/FlashProvider";
import { HelpProvider, useHelp } from "@/components/layout/HelpContext";
import { HelpPanel } from "@/components/layout/HelpPanel";
import { NAV_ITEMS, NAV_UNAVAILABLE } from "@/components/layout/nav-items";
import { ShortcutsProvider } from "@/components/layout/ShortcutsProvider";
import { TopBar } from "@/components/layout/topbar/TopBar";
import { useCurrentUser, useLogout } from "@/features/auth/hooks";
import { CloudShell } from "@/features/cloudshell/CloudShell";

function activeHref(pathname: string): string {
  const flat = NAV_ITEMS.flatMap((i) => (i.type === "section" ? i.items : [i])).filter((i) => i.type === "link") as { href: string }[];
  return flat.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.href ?? "/dashboard";
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <HelpProvider>
      <ConsoleShellInner>{children}</ConsoleShellInner>
    </HelpProvider>
  );
}

function ConsoleShellInner({ children }: { children: React.ReactNode }) {
  const help = useHelp();
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();
  const chromeState = useChromeState();
  const [navOpen, setNavOpen] = useState(true);
  const [cloudShellOpen, setCloudShellOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [unavailableService, setUnavailableService] = useState<string | null>(null);
  const toggleCloudShell = useCallback(() => setCloudShellOpen((o) => !o), []);

  if (isPending || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <Spinner size="large" />
      </div>
    );
  }

  const follow = (event: CustomEvent<{ href: string; external?: boolean }>) => {
    if (NAV_UNAVAILABLE[event.detail.href]) {
      event.preventDefault();
      setUnavailableService(NAV_UNAVAILABLE[event.detail.href]);
      return;
    }
    if (event.detail.external) return;
    event.preventDefault();
    router.push(event.detail.href);
  };

  const signOut = async () => {
    await logout.mutateAsync().catch(() => undefined);
    router.push("/login");
  };

  return (
    <ChromeContext.Provider value={chromeState}>
      <ShortcutsProvider>
        <TopBar
          user={user}
          cloudShellOpen={cloudShellOpen}
          onToggleCloudShell={toggleCloudShell}
          onUnavailable={setUnavailableService}
          onFeedback={() => setFeedbackOpen(true)}
          onSignOut={() => void signOut()}
        />
        <AppLayoutToolbar
          headerSelector="#h"
          footerSelector="#f"
          contentType={chromeState.chrome.contentType}
          tools={<HelpPanel />}
          toolsOpen={help.isOpen}
          onToolsChange={({ detail }) => help.setOpen(detail.open)}
          ariaLabels={{
            navigation: "Route 53 navigation",
            navigationToggle: "Open navigation",
            navigationClose: "Close navigation",
            tools: "Help panel",
            toolsToggle: "Open help panel",
            toolsClose: "Close help panel",
          }}
          navigationOpen={navOpen}
          onNavigationChange={({ detail }) => setNavOpen(detail.open)}
          navigation={<SideNavigation header={{ text: "Route 53", href: "/dashboard" }} activeHref={activeHref(pathname)} items={NAV_ITEMS} onFollow={follow} />}
          breadcrumbs={<BreadcrumbGroup items={[{ text: "Route 53", href: "/dashboard" }, ...chromeState.chrome.breadcrumbs]} onFollow={follow} ariaLabel="Breadcrumbs" />}
          notifications={<FlashMessages />}
          content={<Suspense fallback={<Spinner size="large" />}>{children}</Suspense>}
        />
        <div id="f" style={{ position: "sticky", bottom: 0, zIndex: 1001 }}>
          {cloudShellOpen && <CloudShell user={user} onClose={() => setCloudShellOpen(false)} />}
          <ConsoleFooter onCloudShell={toggleCloudShell} cloudShellOpen={cloudShellOpen} onUnavailable={setUnavailableService} />
        </div>
        <FeedbackModal visible={feedbackOpen} onDismiss={() => setFeedbackOpen(false)} />
        <Modal visible={!!unavailableService} onDismiss={() => setUnavailableService(null)} header={unavailableService ?? ""} closeAriaLabel="Close dialog">
          <Box>{unavailableService} is not available in this Route 53 console clone. Only Route 53 is implemented.</Box>
        </Modal>
      </ShortcutsProvider>
    </ChromeContext.Provider>
  );
}
