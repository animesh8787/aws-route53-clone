"use client";

import Icon from "@cloudscape-design/components/icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useHelp } from "@/components/layout/HelpContext";
import type { ServiceEntry } from "@/components/layout/services-catalog";
import { OPEN_SHORTCUTS_EVENT } from "@/components/layout/ShortcutsProvider";
import { useTheme } from "@/components/layout/ThemeProvider";
import { ConsoleSearch } from "@/components/layout/topbar/ConsoleSearch";
import { QuestionIcon } from "@/components/layout/topbar/icons";
import { AccountMenu, HelpMenu, RegionMenu, SettingsMenu, formatAccountId } from "@/components/layout/topbar/menus";
import { NotificationsMenu } from "@/components/layout/topbar/NotificationsMenu";
import { ServicesMenu } from "@/components/layout/topbar/ServicesMenu";
import { TopMenu } from "@/components/layout/topbar/TopMenu";
import { useActivitySummary, useMarkActivityRead } from "@/features/activity/hooks";
import { useDashboard } from "@/features/dns/hooks";
import { AWS_LOGO_WHITE } from "@/lib/aws-logo";
import type { User } from "@/types/api";

interface Props {
  user: User;
  cloudShellOpen: boolean;
  onToggleCloudShell: () => void;
  onUnavailable: (service: string) => void;
  onFeedback: () => void;
  onSignOut: () => void;
  /** Rendered between the logo and the Services button (the Amazon Q button). */
  leading?: React.ReactNode;
  onAsk?: (question: string) => void;
}

/** The console's dark top bar, laid out like the AWS console. */
export function TopBar({ user, cloudShellOpen, onToggleCloudShell, onUnavailable, onFeedback, onSignOut, leading, onAsk }: Props) {
  const router = useRouter();
  const help = useHelp();
  const { preference, setPreference } = useTheme();
  const [menu, setMenu] = useState<string | null>(null);
  const activity = useActivitySummary(true);
  const dashboard = useDashboard();
  const markRead = useMarkActivityRead();
  const unread = activity.data?.unread ?? 0;

  const go = useCallback(
    (href: string) => {
      setMenu(null);
      router.push(href);
    },
    [router],
  );
  const openService = useCallback(
    (service: ServiceEntry) => {
      setMenu(null);
      if (service.href) router.push(service.href);
      else onUnavailable(service.name);
    },
    [router, onUnavailable],
  );

  return (
    <header id="h" className="r53-topbar" style={{ position: "sticky", top: 0, zIndex: 1002 }}>
      <div className="r53-topbar-left">
        <Link className="r53-logo" href="/dashboard" aria-label="Route 53 console home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AWS_LOGO_WHITE} alt="AWS" height={26} />
        </Link>
        {leading && (
          <>
            <span className="r53-divider" aria-hidden="true" />
            {leading}
          </>
        )}
        <span className="r53-divider" aria-hidden="true" />
        <TopMenu id="services" open={menu === "services"} onToggle={setMenu} label="Services" trigger={<Icon name="grid-view" variant="inverted" />} align="left" width="auto">
          <ServicesMenu onOpenService={openService} onClose={() => setMenu(null)} />
        </TopMenu>
        <ConsoleSearch onNavigate={go} onOpenService={openService} onAsk={onAsk} />
      </div>
      <div className="r53-topbar-right">
        <button type="button" className="r53-icon-btn r53-hide-narrow" aria-label="CloudShell" title="CloudShell" aria-pressed={cloudShellOpen} onClick={onToggleCloudShell}>
          <Icon name="command-prompt" variant="inverted" />
        </button>
        <span className="r53-sep r53-hide-narrow" aria-hidden="true" />
        <TopMenu
          id="notifications"
          open={menu === "notifications"}
          onToggle={setMenu}
          label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          title="Notifications"
          trigger={<Icon name="notification" variant="inverted" />}
          badge={unread > 0}
          width={460}
        >
          <NotificationsMenu events={activity.data?.items ?? []} summary={dashboard.data} unread={unread} onMarkRead={() => markRead.mutate()} onNavigate={go} />
        </TopMenu>
        <span className="r53-sep" aria-hidden="true" />
        <TopMenu id="help" open={menu === "help"} onToggle={setMenu} label="Help" role="menu" trigger={<QuestionIcon />} width={260}>
          <HelpMenu
            onHelpPanel={() => {
              setMenu(null);
              help.open();
            }}
            onShortcuts={() => {
              setMenu(null);
              window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
            }}
            onFeedback={() => {
              setMenu(null);
              onFeedback();
            }}
          />
        </TopMenu>
        <span className="r53-sep r53-hide-narrow" aria-hidden="true" />
        <TopMenu id="settings" open={menu === "settings"} onToggle={setMenu} label="Settings" trigger={<Icon name="settings" variant="inverted" />} width={340}>
          <SettingsMenu preference={preference} onPreference={setPreference} onAllSettings={() => go("/account")} />
        </TopMenu>
        <span className="r53-sep r53-hide-narrow" aria-hidden="true" />
        <TopMenu
          id="region"
          open={menu === "region"}
          onToggle={setMenu}
          label="Region: Global"
          title="Route 53 is a global service"
          triggerClassName="r53-icon-btn r53-hide-narrow"
          trigger={
            <>
              Global <Icon name="caret-down-filled" variant="inverted" size="small" />
            </>
          }
          width={320}
        >
          <RegionMenu />
        </TopMenu>
        <TopMenu
          id="account"
          open={menu === "account"}
          onToggle={setMenu}
          label={`${user.display_name} (${formatAccountId(user.account_id)})`}
          triggerClassName="r53-account-btn"
          trigger={
            <>
              <span>
                {user.display_name} ({user.account_id})
              </span>
              <span className="r53-account-sub">{user.email}</span>
              <span className="r53-account-caret">
                <Icon name="caret-down-filled" variant="inverted" size="small" />
              </span>
            </>
          }
          width={340}
        >
          <AccountMenu
            user={user}
            onNavigate={go}
            onSignOut={() => {
              setMenu(null);
              onSignOut();
            }}
          />
        </TopMenu>
      </div>
    </header>
  );
}
