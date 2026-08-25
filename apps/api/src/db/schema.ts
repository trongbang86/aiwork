import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(), name: text('name').notNull(), projectId: text('project_id'), ...timestamps,
});
export const workflowStates = sqliteTable('workflow_states', {
  id: text('id').primaryKey(), workflowId: text('workflow_id').notNull(), key: text('key').notNull(),
  name: text('name').notNull(), position: integer('position').notNull(), instructions: text('instructions'), actorId: text('actor_id'),
}, (t) => [uniqueIndex('state_workflow_key').on(t.workflowId, t.key)]);
export const workflowTransitions = sqliteTable('workflow_transitions', {
  id: text('id').primaryKey(), workflowId: text('workflow_id').notNull(), fromStateId: text('from_state_id').notNull(),
  toStateId: text('to_state_id').notNull(), requiredRole: text('required_role'),
});
export const actors = sqliteTable('actors', {
  id: text('id').primaryKey(), name: text('name').notNull(), role: text('role').notNull(),
  kind: text('kind').notNull(), instructions: text('instructions'), capabilitiesJson: text('capabilities_json').notNull().default('[]'),
});
export const workItemTypes = sqliteTable('work_item_types', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), name: text('name').notNull(), level: integer('level').notNull(),
});
export const workItems = sqliteTable('work_items', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), typeId: text('type_id').notNull(), parentId: text('parent_id'),
  projectId: text('project_id').notNull(), workflowId: text('workflow_id').notNull(), stateId: text('state_id').notNull(),
  title: text('title').notNull(), description: text('description'), aiInstructions: text('ai_instructions'),
  activeActorId: text('active_actor_id'), version: integer('version').notNull().default(1), ...timestamps,
});
export const projectTemplates = sqliteTable('project_templates', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull(), itemType: text('item_type').notNull(),
  descriptionTemplate: text('description_template').notNull(), ...timestamps,
}, (t) => [uniqueIndex('project_template_type').on(t.projectId, t.itemType)]);
export const aiInstructionVersions = sqliteTable('ai_instruction_versions', {
  id: text('id').primaryKey(), templateId: text('template_id').notNull(), version: integer('version').notNull(),
  name: text('name').notNull(), instructions: text('instructions').notNull(), comment: text('comment').notNull().default(''),
  isActive: integer('is_active', { mode:'boolean' }).notNull().default(false), ...timestamps,
}, (t) => [uniqueIndex('template_instruction_version').on(t.templateId, t.version)]);
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(), workItemId: text('work_item_id').notNull(), body: text('body').notNull(),
  authorId: text('author_id').notNull(), createdAt: text('created_at').notNull(),
});
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(), workItemId: text('work_item_id').notNull(), filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(), size: integer('size').notNull(), storageKey: text('storage_key').notNull(),
  variantsJson: text('variants_json').notNull().default('{}'), createdAt: text('created_at').notNull(),
});
export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(), workItemId: text('work_item_id'), actorId: text('actor_id'), userId: text('user_id'),
  action: text('action').notNull(), previousState: text('previous_state'), newState: text('new_state'),
  correlationId: text('correlation_id').notNull(), detailsJson: text('details_json').notNull().default('{}'), createdAt: text('created_at').notNull(),
});
