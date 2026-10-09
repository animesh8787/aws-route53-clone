"use client";

import Icon from "@cloudscape-design/components/icon";
import { useState } from "react";

import { ALL_SERVICES, DEFAULT_RECENT, SERVICE_CATEGORIES, findService, type ServiceEntry } from "@/components/layout/services-catalog";
import { useStoredList } from "@/hooks/useStoredList";

const VIEWS = ["Recently visited", "Favorites", "All applications", "All services"] as const;

interface Props {
  onOpenService: (service: ServiceEntry) => void;
  onClose: () => void;
}

/** Two-pane Services menu: views and categories on the left, the chosen list on the right. */
export function ServicesMenu({ onOpenService, onClose }: Props) {
  const [view, setView] = useState<string>("Recently visited");
  const [recent, setRecent] = useStoredList("r53-recent-services", DEFAULT_RECENT);
  const [favorites, setFavorites] = useStoredList("r53-favorite-services", []);

  const open = (service: ServiceEntry) => {
    if (service.href) setRecent([service.name, ...recent.filter((n) => n !== service.name)].slice(0, 10));
    onOpenService(service);
  };
  const toggleFavorite = (name: string) => setFavorites(favorites.includes(name) ? favorites.filter((n) => n !== name) : [...favorites, name]);

  let services: ServiceEntry[] = [];
  let empty = "";
  if (view === "Recently visited") {
    services = recent.map(findService).filter((x): x is ServiceEntry => !!x);
    empty = "Services you open appear here.";
  } else if (view === "Favorites") {
    services = favorites.map(findService).filter((x): x is ServiceEntry => !!x);
    empty = "Choose the star next to a service to add it to your favorites.";
  } else if (view === "All applications") {
    empty = "No applications. Applications group the resources of one workload across services; this console has none.";
  } else if (view === "All services") {
    services = ALL_SERVICES;
  } else {
    services = SERVICE_CATEGORIES.find((c) => c.title === view)?.services ?? [];
  }

  return (
    <div className="r53-services">
      <nav className="r53-services-nav" aria-label="Service views">
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-current={view === v} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
        <hr />
        {SERVICE_CATEGORIES.map((c) => (
          <button key={c.title} type="button" aria-current={view === c.title} onClick={() => setView(c.title)}>
            {c.title}
          </button>
        ))}
      </nav>
      <section className="r53-services-body" aria-label={view}>
        <header>
          <h2>{view}</h2>
          <button type="button" className="r53-icon-btn" aria-label="Close services menu" onClick={onClose}>
            <Icon name="close" variant="inverted" />
          </button>
        </header>
        {services.length === 0 ? (
          <p className="r53-muted">{empty}</p>
        ) : (
          <div role="menu" aria-label={view}>
            {services.map((service) => (
              <div key={service.name} className="r53-service">
                <button type="button" role="menuitem" onClick={() => open(service)}>
                  {service.name}
                  <small>{service.description}</small>
                </button>
                <button
                  type="button"
                  className="r53-star"
                  aria-pressed={favorites.includes(service.name)}
                  aria-label={`${favorites.includes(service.name) ? "Remove" : "Add"} ${service.name} ${favorites.includes(service.name) ? "from" : "to"} favorites`}
                  onClick={() => toggleFavorite(service.name)}
                >
                  <Icon name={favorites.includes(service.name) ? "star-filled" : "star"} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
