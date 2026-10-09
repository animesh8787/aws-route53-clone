"use client";

import AppLayout from "@cloudscape-design/components/app-layout";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import Spinner from "@cloudscape-design/components/spinner";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

import { ChromeContext, useChromeState } from "@/components/layout/ChromeContext";
import { HelpProvider, useHelp } from "@/components/layout/HelpContext";
import { HelpPanel } from "@/components/layout/HelpPanel";
import { FlashMessages } from "@/components/layout/FlashProvider";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { ShortcutsProvider } from "@/components/layout/ShortcutsProvider";
import { useTheme } from "@/components/layout/ThemeProvider";
import Box from "@cloudscape-design/components/box";
import Modal from "@cloudscape-design/components/modal";
import { SERVICE_MENU_ITEMS, nameFromServiceId } from "@/components/layout/services-catalog";
import { timeAgo, useActivitySummary, useMarkActivityRead } from "@/features/activity/hooks";
import { useCurrentUser, useLogout } from "@/features/auth/hooks";
import { AWS_LOGO_WHITE } from "@/lib/aws-logo";

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
  const { mode, toggle } = useTheme();
  const chromeState = useChromeState();
  const [navOpen, setNavOpen] = useState(true);
  const [unavailableService, setUnavailableService] = useState<string | null>(null);
  const activity = useActivitySummary(!!user);
  const markRead = useMarkActivityRead();

  if (isPending || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <Spinner size="large" />
      </div>
    );
  }

  const follow = (event: CustomEvent<{ href: string; external?: boolean }>) => {
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
        <div id="h" style={{ position: "sticky", top: 0, zIndex: 1002 }}>
          <TopNavigation
            identity={{ href: "/dashboard", logo: { src: AWS_LOGO_WHITE, alt: "AWS" }, onFollow: (e) => { e.preventDefault(); router.push("/dashboard"); } }}
            i18nStrings={{ overflowMenuTriggerText: "More", overflowMenuTitleText: "All", overflowMenuBackIconAriaLabel: "Back", overflowMenuDismissIconAriaLabel: "Close menu" }}
            utilities={[
              {
                type: "menu-dropdown",
                text: "Services",
                iconName: "view-full",
                ariaLabel: "Services",
                items: SERVICE_MENU_ITEMS,
                onItemClick: ({ detail }) => {
                  const name = nameFromServiceId(detail.id);
                  if (name === "Route 53") router.push("/dashboard");
                  else if (name) setUnavailableService(name);
                },
              },
              {
                type: "menu-dropdown",
                iconName: "notification",
                ariaLabel: `Notifications${activity.data?.unread ? ` (${activity.data.unread} unread)` : ""}`,
                title: "Notifications",
                badge: !!activity.data?.unread,
                items: [
                  ...((activity.data?.items.length ?? 0) > 0
                    ? (activity.data?.items ?? []).map((e) => ({
                        id: `event:${e.id}:${e.href ?? ""}`,
                        text: `${e.is_read ? "" : "● "}${e.action.charAt(0).toUpperCase() + e.action.slice(1)} ${e.resource_type.toLowerCase()}: ${e.name}`,
                        description: `${timeAgo(e.created_at)}${e.detail ? ` · ${e.detail}` : ""}`,
                      }))
                    : [{ id: "none", text: "No notifications yet", disabled: true }]),
                  { id: "read", text: "Mark all as read", disabled: !activity.data?.unread },
                  { id: "all", text: "View all activity" },
                ],
                onItemClick: ({ detail }) => {
                  if (detail.id === "read") markRead.mutate();
                  else if (detail.id === "all") router.push("/activity");
                  else if (detail.id.startsWith("event:")) {
                    const href = detail.id.split(":").slice(2).join(":");
                    if (href) router.push(href);
                  }
                },
              },
              { type: "button", iconName: "status-info", ariaLabel: "Help", title: "Help", onClick: () => help.open() },
              {
                type: "menu-dropdown",
                text: "Global",
                description: "Route 53 is a global service",
                items: [{ id: "global", text: "Global", description: "Route 53 is a global service: no Region needs to be chosen" }],
              },
              {
                type: "menu-dropdown",
                text: `${user.display_name} @ ${user.account_id.replace(/(\d{4})(\d{4})(\d{4})/, "$1-$2-$3")}`,
                iconName: "user-profile",
                description: user.email,
                items: [
                  { id: "account", text: "Account" },
                  { id: "billing", text: "Billing and Cost Management" },
                  { id: "credentials", text: "Security credentials" },
                  { id: "theme", text: mode === "dark" ? "Switch to light mode" : "Switch to dark mode", iconName: mode === "dark" ? "view-full" : "settings" },
                  { id: "signout", text: "Sign out" },
                ],
                onItemClick: ({ detail }) => {
                  if (detail.id === "signout") void signOut();
                  if (detail.id === "theme") toggle();
                  if (detail.id === "account") router.push("/account");
                  if (detail.id === "billing") router.push("/billing");
                  if (detail.id === "credentials") router.push("/security-credentials");
                },
              },
            ]}
          />
        </div>
        <AppLayout
          headerSelector="#h"
          contentType={chromeState.chrome.contentType}
          tools={<HelpPanel />}
          toolsOpen={help.isOpen}
          onToolsChange={({ detail }) => help.setOpen(detail.open)}
          ariaLabels={{ tools: "Help panel", toolsToggle: "Open help panel", toolsClose: "Close help panel" }}
          navigationOpen={navOpen}
          onNavigationChange={({ detail }) => setNavOpen(detail.open)}
          navigation={
            <SideNavigation
              header={{ text: "Route 53", href: "/dashboard" }}
              activeHref={activeHref(pathname)}
              items={NAV_ITEMS}
              onFollow={follow}
            />
          }
          breadcrumbs={
            <BreadcrumbGroup
              items={[{ text: "Route 53", href: "/dashboard" }, ...chromeState.chrome.breadcrumbs]}
              onFollow={follow}
              ariaLabel="Breadcrumbs"
            />
          }
          notifications={<FlashMessages />}
          content={<Suspense fallback={<Spinner size="large" />}>{children}</Suspense>}
        />
        <Modal visible={!!unavailableService} onDismiss={() => setUnavailableService(null)} header={unavailableService ?? ""} closeAriaLabel="Close dialog">
          <Box>{unavailableService} is not available in this Route 53 console clone. Only Route 53 is implemented.</Box>
        </Modal>
      </ShortcutsProvider>
    </ChromeContext.Provider>
  );
}
