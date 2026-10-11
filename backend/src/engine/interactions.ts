import { InteractionWireframe, VisualManifestItem } from "./types";
export function planInteractions(visuals: VisualManifestItem[], dateFields: string[], categoryFields: string[]): InteractionWireframe {
  const globalFilters = [...new Set([...dateFields.slice(0, 1), ...categoryFields.filter(f => /region|country|state|city|department|category|channel/i.test(f)).slice(0, 2)])];
  const scopes: InteractionWireframe["scopes"] = {};
  for (const v of visuals) {
    const listenTo = globalFilters.filter(f => v.encodings.x !== f || v.type !== "kpi");
    const ignore: string[] = [];
    if (v.interactionRole === "kpi") ignore.push(...categoryFields);
    if (v.interactionRole === "trend") ignore.push(...categoryFields.filter(f => !/region|country|state|city/i.test(f)));
    scopes[v.id] = { listenTo, ignore, publish: v.interactionRole === "breakdown" && v.encodings.x ? [v.encodings.x] : [] };
  }
  const events = visuals.filter(v => v.interactionRole === "breakdown" && v.encodings.x).map(v => ({ id: `evt_${v.id}`, publisher: v.id, subscribers: visuals.filter(other => other.id !== v.id && scopes[other.id].listenTo.includes(v.encodings.x!) && !scopes[other.id].ignore.includes(v.encodings.x!)).map(other => other.id), dimension: v.encodings.x!, kind: "filter" as const }));
  return { version: "1.0.0", globalFilters, scopes, events, cycleProtection: "origin-and-event-id" };
}
