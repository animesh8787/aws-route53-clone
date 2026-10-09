"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs from "@cloudscape-design/components/tabs";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { useHelp } from "@/components/layout/HelpContext";
import { DeleteResourceModal } from "@/components/resource/DeleteResourceModal";
import { ErrorState } from "@/components/states/States";
import { useResource } from "@/features/resources/api";
import { useUrlParams } from "@/hooks/useUrlParams";
import type { ResourceConfig } from "@/lib/resource-config";

/** Detail page: key/value summary, optional tabs and edit / delete actions. */
export function ResourceDetailPage({ config, id }: { config: ResourceConfig; id: string }) {
  const router = useRouter();
  const help = useHelp();
  const { params, update } = useUrlParams();
  const { data: item, error, refetch } = useResource(config, id);
  const [deleting, setDeleting] = useState(false);
  usePageChrome(
    [
      { text: config.title, href: `/${config.route}` },
      { text: item?.name ?? id, href: `/${config.route}/${id}` },
    ],
    "default",
  );

  if (error) return <ErrorState error={error} onRetry={() => refetch()} title={`Unable to load ${config.singular}`} />;
  if (!item) return <Spinner size="large" />;

  const tabs = config.detailTabs ?? [];
  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        info={<Link variant="info" onFollow={() => help.open(config.helpTopic ?? config.route)}>Info</Link>}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            {config.detailActions?.(item, () => void refetch())}
            {!config.readOnly && <Button onClick={() => setDeleting(true)}>Delete</Button>}
            {!config.readOnly && <Button variant="primary" onClick={() => router.push(`/${config.route}/${id}/edit`)}>Edit</Button>}
          </SpaceBetween>
        }
      >
        {item.name}
      </Header>

      <Container header={<Header variant="h2">{config.singular.charAt(0).toUpperCase() + config.singular.slice(1)} details</Header>}>
        <ColumnLayout columns={3} variant="text-grid">
          {config.detailRows.map((row) => (
            <div key={row.label}>
              <Box variant="awsui-key-label">{row.label}</Box>
              <div>{row.value(item) ?? "-"}</div>
            </div>
          ))}
        </ColumnLayout>
      </Container>

      {tabs.length > 0 && (
        <Container disableContentPaddings>
          <Tabs
            activeTabId={params.get("tab") ?? tabs[0].id}
            onChange={({ detail }) => update({ tab: detail.activeTabId === tabs[0].id ? null : detail.activeTabId })}
            tabs={tabs.map((t) => ({ id: t.id, label: t.label(item), content: <Box padding="l">{t.render(item)}</Box> }))}
          />
        </Container>
      )}
      <DeleteResourceModal config={config} item={deleting ? item : null} onDismiss={() => setDeleting(false)} onDeleted={() => router.push(`/${config.route}`)} />
    </SpaceBetween>
  );
}
