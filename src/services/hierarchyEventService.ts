import { EventEmitter } from "node:events";
import { run, all } from "../db/connection.js";
import type { HierarchyScope } from "../types/dataLayer.js";

interface PublishedHierarchyEvent extends Record<string, any> {
  id: number;
  event_type: string;
  scope_level: "hq" | "region" | "branch";
  region_id: number | null;
  branch_id: number | null;
  actor_user_id: number | null;
  details: unknown;
  created_at: string;
}

function createHierarchyEventService() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);

  async function publishHierarchyEvent({
    eventType,
    scopeLevel = "hq",
    regionId = null,
    branchId = null,
    actorUserId = null,
    details = null,
  }: {
    eventType: string;
    scopeLevel?: "hq" | "region" | "branch";
    regionId?: number | null;
    branchId?: number | null;
    actorUserId?: number | null;
    details?: unknown;
  }): Promise<PublishedHierarchyEvent> {
    const createdAt = new Date().toISOString();
    const result = await run(
      `INSERT INTO hierarchy_events
         (event_type, scope_level, region_id, branch_id, actor_user_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        eventType,
        scopeLevel,
        regionId,
        branchId,
        actorUserId,
        details !== null && details !== undefined ? JSON.stringify(details) : null,
        createdAt,
      ],
    );

    const event: PublishedHierarchyEvent = {
      id: Number(result.lastID || 0),
      event_type: eventType,
      scope_level: scopeLevel,
      region_id: regionId,
      branch_id: branchId,
      actor_user_id: actorUserId,
      details,
      created_at: createdAt,
    };

    emitter.emit("hierarchy-event", event);
    return event;
  }

  function isEventVisibleToScope(event: Record<string, any>, scope: HierarchyScope | null | undefined): boolean {
    if (!scope || scope.level === "hq") {
      return true;
    }

    const scopeBranchIds = Array.isArray(scope.branchIds)
      ? scope.branchIds.filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (scope.level === "branch") {
      return scopeBranchIds.includes(Number(event.branch_id));
    }

    if (scope.level === "region") {
      if (scope.regionId && Number(event.region_id) === Number(scope.regionId)) {
        return true;
      }
      return scopeBranchIds.includes(Number(event.branch_id));
    }

    return true;
  }

  function subscribe(listener: (event: Record<string, any>) => void): () => void {
    emitter.on("hierarchy-event", listener);
    return () => emitter.off("hierarchy-event", listener);
  }

  async function listHierarchyEvents(
    { sinceId = 0, limit = 100, scope }: { sinceId?: number; limit?: number; scope?: HierarchyScope | null },
  ): Promise<Array<Record<string, any>>> {
    const safeLimit = Math.min(Math.max(Math.floor(Number(limit) || 50), 1), 500);
    const safeSinceId = Math.max(0, Number(sinceId) || 0);
    const rows = await all(
      "SELECT * FROM hierarchy_events WHERE id > ? ORDER BY id ASC LIMIT ?",
      [safeSinceId, safeLimit],
    );

    return rows
      .filter((row: Record<string, any>) => isEventVisibleToScope(row, scope))
      .map((row: Record<string, any>) => ({
        ...row,
        details: row.details ? safeJsonParse(row.details) : null,
      }));
  }

  return {
    publishHierarchyEvent,
    subscribe,
    listHierarchyEvents,
    isEventVisibleToScope,
  };
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

export {
  createHierarchyEventService,
};
