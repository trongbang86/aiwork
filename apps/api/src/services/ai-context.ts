import type { Sqlite } from '../db/index.js';

type Provenance = { level: string; id: string; instructions: string; distance: number; role?: string };
type ContextMode = 'compact' | 'full';

export class AiContextService {
  constructor(private readonly db: Sqlite) {}

  get(itemId: string, mode: ContextMode, maxTokens?: number) {
    const row = this.db.prepare(`
      WITH RECURSIVE ancestors(id,parent_id,type_id,ai_instructions,distance) AS (
        SELECT id,parent_id,type_id,ai_instructions,0 FROM work_items WHERE id=?
        UNION ALL
        SELECT w.id,w.parent_id,w.type_id,w.ai_instructions,a.distance+1 FROM work_items w JOIN ancestors a ON w.id=a.parent_id
      )
      SELECT w.id,w.key,w.title,w.description,w.ai_instructions,w.version,t.key AS type,s.key AS status,s.instructions AS state_instructions,
             a.id AS actor_id,a.name AS actor_name,a.role,a.instructions AS actor_instructions,a.capabilities_json,
             (SELECT json_group_array(json_object('id',x.id,'level',xt.key,'instructions',x.ai_instructions,'distance',x.distance))
                FROM ancestors x JOIN work_item_types xt ON xt.id=x.type_id WHERE x.ai_instructions IS NOT NULL AND trim(x.ai_instructions)<>'') AS provenance_json,
             (SELECT json_group_array(json_object('id',c.id,'body',c.body,'authorId',c.author_id,'createdAt',c.created_at)) FROM comments c WHERE c.work_item_id=w.id) AS comments_json,
             (SELECT json_group_array(json_object('id',ch.id,'key',ch.key,'title',ch.title)) FROM work_items ch WHERE ch.parent_id=w.id) AS children_json,
             (SELECT json_group_array(json_object('id',at.id,'filename',at.filename,'mimeType',at.mime_type)) FROM attachments at WHERE at.work_item_id=w.id) AS attachments_json,
             (SELECT json_group_array(ts.key) FROM workflow_transitions tr JOIN workflow_states ts ON ts.id=tr.to_state_id WHERE tr.workflow_id=w.workflow_id AND tr.from_state_id=w.state_id) AS transitions_json
        FROM work_items w JOIN work_item_types t ON t.id=w.type_id JOIN workflow_states s ON s.id=w.state_id
        LEFT JOIN actors a ON a.id=w.active_actor_id WHERE w.id=?
    `).get(itemId, itemId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const inherited = JSON.parse(String(row.provenance_json ?? '[]')) as Provenance[];
    inherited.sort((a, b) => b.distance - a.distance);
    const provenance: Provenance[] = [...inherited];
    if (row.state_instructions) provenance.push({ level: 'state', id: String(row.status), instructions: String(row.state_instructions), distance: -1 });
    if (row.actor_instructions) provenance.push({ level: 'actor', id: String(row.actor_id), role: String(row.role), instructions: String(row.actor_instructions), distance: -2 });
    const budgeted = this.applyBudget(provenance, maxTokens);
    const actions = (JSON.parse(String(row.transitions_json ?? '[]')) as string[]).map((toState) => ({ action: 'transition', toState }));
    const response: Record<string, unknown> = {
      workItem: { id: row.id, key: row.key, type: row.type, title: row.title, aiInstructions: row.ai_instructions, status: row.status, version: row.version },
      context: { provenance: budgeted },
      effectiveInstructions: budgeted.map((p) => `[${p.level}:${p.id}]\n${p.instructions}`).join('\n\n'),
      availableActions: actions,
      apiSchema: actionSchemas(String(row.id), Number(row.version)),
    };
    if (mode === 'full') {
      response.details = { description: row.description, comments: JSON.parse(String(row.comments_json)), children: JSON.parse(String(row.children_json)), attachments: JSON.parse(String(row.attachments_json)) };
    }
    return response;
  }

  private applyBudget(blocks: Provenance[], maxTokens?: number) {
    if (!maxTokens) return blocks;
    let chars = Math.max(0, maxTokens * 4);
    // Keep state, actor, local, direct parent, then increasingly distant ancestors.
    const priority = [...blocks].sort((a, b) => {
      const score = (x: Provenance) => x.level === 'state' ? 0 : x.level === 'actor' ? 1 : x.distance === 0 ? 2 : x.distance === 1 ? 3 : x.level === 'project' ? 4 : 5 + x.distance;
      return score(a) - score(b);
    });
    const kept = new Map<string, Provenance>();
    for (const block of priority) {
      if (chars <= 0) break;
      const instructions = block.instructions.length <= chars ? block.instructions : `${block.instructions.slice(0, Math.max(0, chars - 14))}… [truncated]`;
      kept.set(`${block.level}:${block.id}`, { ...block, instructions });
      chars -= instructions.length;
    }
    return blocks.filter((b) => kept.has(`${b.level}:${b.id}`)).map((b) => kept.get(`${b.level}:${b.id}`)!);
  }
}

function actionSchemas(itemId: string, version: number) {
  return {
    tools: [
      { name: 'transition_work_item', method: 'POST', path: `/v1/work-items/${itemId}/transition`, inputSchema: { type: 'object', required: ['toState','expectedVersion'], properties: { toState: { type: 'string' }, expectedVersion: { type: 'integer', default: version } } } },
      { name: 'add_comment', method: 'POST', path: `/v1/work-items/${itemId}/comments`, inputSchema: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1 } } } },
      { name: 'create_child', method: 'POST', path: '/v1/work-items', inputSchema: { type: 'object', required: ['parentId','type','title'], properties: { parentId: { const: itemId }, type: { type: 'string' }, title: { type: 'string' } } } },
      { name: 'upload_attachment', method: 'POST', path: `/v1/work-items/${itemId}/attachments`, inputSchema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } },
    ],
  };
}
