import { z } from "zod";

import {
  validateCaaValue,
  validateHostname,
  validateInt,
  validateIPv4,
  validateIPv6,
  validateRecordName,
  validateTtl,
  validateTxt,
  CAA_TAGS,
} from "@/lib/dns-validation";
import { RECORD_TYPE_MAP, type RecordFormValues } from "@/lib/record-config";

const row = z.record(z.string(), z.string());

/** Form schema; per-type and per-policy rules live in superRefine (one schema, all record types). */
export function buildRecordSchema(zoneName: string) {
  return z
    .object({
      name: z.string(),
      type: z.string(),
      aliasEnabled: z.boolean(),
      aliasTarget: z.string(),
      aliasTargetType: z.string(),
      evaluateTargetHealth: z.boolean(),
      valuesText: z.string(),
      mxRows: z.array(row),
      srvRows: z.array(row),
      caaRows: z.array(row),
      ttl: z.string(),
      routingPolicy: z.string(),
      setIdentifier: z.string(),
      weight: z.string(),
      region: z.string(),
      failover: z.string(),
      geoKind: z.string(),
      geoContinent: z.string(),
      geoCountry: z.string(),
      geoSubdivision: z.string(),
      cidrCollectionId: z.string(),
      cidrLocation: z.string(),
      healthCheckId: z.string(),
    })
    .superRefine((v, ctx) => {
      const add = (path: (string | number)[], message: string | null) => {
        if (message) ctx.addIssue({ code: "custom", path, message });
      };
      const f = v as unknown as RecordFormValues;
      const config = RECORD_TYPE_MAP[f.type];

      add(["name"], validateRecordName(f.name, zoneName));
      if (f.type === "CNAME" && ["", "@", `${zoneName}`, `${zoneName}.`].includes(f.name.trim().toLowerCase())) {
        add(["name"], "A CNAME record cannot be created at the zone apex.");
      }

      // ---- routing policy
      if (f.routingPolicy !== "simple") {
        if (!f.setIdentifier.trim()) add(["setIdentifier"], "Record ID is required for this routing policy.");
        else if (f.setIdentifier.length > 128) add(["setIdentifier"], "Record ID cannot exceed 128 characters.");
      }
      if (f.routingPolicy === "weighted") add(["weight"], validateInt(f.weight, "Weight", 0, 255));
      if (f.routingPolicy === "ipbased") {
        if (!f.cidrCollectionId) add(["cidrCollectionId"], "Choose a CIDR collection.");
        if (!f.cidrLocation) add(["cidrLocation"], "Choose a location, or Default.");
      }
      if (f.routingPolicy === "geolocation" && f.geoKind === "country" && f.geoCountry === "US" && f.geoSubdivision.trim()) {
        if (!/^[A-Za-z0-9]{1,3}$/.test(f.geoSubdivision.trim())) add(["geoSubdivision"], "Use a 1-3 character state code, for example CA.");
      }

      // ---- alias
      if (f.aliasEnabled) {
        if (!config?.supportsAlias) add(["aliasEnabled"], "Alias is only supported for A, AAAA and CNAME records.");
        const target = f.aliasTarget.trim();
        if (!target) add(["aliasTarget"], "Alias target is required.");
        else if (f.aliasTargetType !== "record") add(["aliasTarget"], validateHostname(target, "Alias target"));
        else add(["aliasTarget"], validateRecordName(target, zoneName));
        return;
      }

      add(["ttl"], validateTtl(f.ttl));

      // ---- values
      switch (config?.mode) {
        case "mx":
          f.mxRows.forEach((r, i) => {
            add(["mxRows", i, "priority"], validateInt(r.priority, "Priority", 0, 65535));
            add(["mxRows", i, "server"], validateHostname(r.server, "Mail server"));
          });
          break;
        case "srv":
          f.srvRows.forEach((r, i) => {
            add(["srvRows", i, "priority"], validateInt(r.priority, "Priority", 0, 65535));
            add(["srvRows", i, "weight"], validateInt(r.weight, "Weight", 0, 65535));
            add(["srvRows", i, "port"], validateInt(r.port, "Port", 0, 65535));
            add(["srvRows", i, "target"], validateHostname(r.target, "Target"));
          });
          break;
        case "caa":
          f.caaRows.forEach((r, i) => {
            add(["caaRows", i, "flags"], validateInt(r.flags, "Flags", 0, 255));
            if (!(CAA_TAGS as readonly string[]).includes(r.tag)) add(["caaRows", i, "tag"], "Choose issue, issuewild or iodef.");
            add(["caaRows", i, "value"], validateCaaValue(r.value));
          });
          break;
        default: {
          const lines = f.valuesText.split("\n").map((l) => l.trim()).filter(Boolean);
          if (lines.length === 0) {
            add(["valuesText"], "At least one value is required.");
            break;
          }
          if ((f.type === "CNAME" || f.routingPolicy === "multivalue") && lines.length > 1) {
            add(["valuesText"], f.type === "CNAME" ? "A CNAME record can only have a single value." : "A multivalue answer record can only have a single value.");
            break;
          }
          const check = (line: string) =>
            f.type === "SOA" ? (line.split(/\s+/).length === 7 ? null : "SOA needs 7 fields: primary-ns hostmaster serial refresh retry expire minimum.")
            : f.type === "A" ? validateIPv4(line)
            : f.type === "AAAA" ? validateIPv6(line)
            : f.type === "TXT" ? validateTxt(line)
            : validateHostname(line, "Value");
          const bad = lines.map((l, i) => ({ i, e: check(l) })).find((x) => x.e);
          if (bad) add(["valuesText"], lines.length > 1 ? `Line ${bad.i + 1}: ${bad.e}` : bad.e);
          else if (new Set(lines).size !== lines.length) add(["valuesText"], "Duplicate values are not allowed.");
        }
      }
    });
}
