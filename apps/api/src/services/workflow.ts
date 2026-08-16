import { randomUUID } from 'node:crypto';
import type { Sqlite } from '../db/index.js';

export class DomainError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: unknown) { super(message); }
}

export class WorkflowService {
  constructor(private readonly db: Sqlite) {}

  transition(itemId: string, toStateKey: string, expectedVersion: number, identity: { userId: string; actorId?: string }, correlationId: string) {
    return this.db.transaction(() => {
      const item = this.db.prepare(`SELECT w.*,s.key AS current_state FROM work_items w JOIN workflow_states s ON s.id=w.state_id WHERE w.id=?`).get(itemId) as Record<string, unknown> | undefined;
      if (!item) throw new DomainError(404, 'WORK_ITEM_NOT_FOUND', 'Work item was not found.', { itemId });
      if (item.version !== expectedVersion) throw new DomainError(412, 'STALE_WORK_ITEM', 'The work item has changed. Refresh and retry.', { expectedVersion, actualVersion: item.version });
      const transition = this.db.prepare(`SELECT ts.id AS state_id,ts.key AS state_key,ts.actor_id FROM workflow_transitions tr JOIN workflow_states ts ON ts.id=tr.to_state_id WHERE tr.workflow_id=? AND tr.from_state_id=? AND ts.key=?`).get(item.workflow_id, item.state_id, toStateKey) as Record<string, unknown> | undefined;
      if (!transition) {
        const allowed = this.db.prepare(`SELECT ts.key FROM workflow_transitions tr JOIN workflow_states ts ON ts.id=tr.to_state_id WHERE tr.workflow_id=? AND tr.from_state_id=?`).all(item.workflow_id,item.state_id).map((x) => (x as {key:string}).key);
        throw new DomainError(400, 'INVALID_WORKFLOW_TRANSITION', `Cannot move ${String(item.key)} directly from ${String(item.current_state)} to ${toStateKey}.`, { currentState: item.current_state, requestedState: toStateKey, allowedTransitions: allowed });
      }
      const now = new Date().toISOString();
      const changed = this.db.prepare('UPDATE work_items SET state_id=?,active_actor_id=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(transition.state_id, transition.actor_id, now, itemId, expectedVersion);
      if (changed.changes !== 1) throw new DomainError(412, 'STALE_WORK_ITEM', 'The work item changed during transition.', {});
      this.db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),itemId,identity.actorId ?? transition.actor_id,identity.userId,'work_item.transition',item.current_state,transition.state_key,correlationId,'{}',now);
      return { id: itemId, previousState: item.current_state, state: transition.state_key, activeActorId: transition.actor_id, version: expectedVersion + 1 };
    })();
  }
}
