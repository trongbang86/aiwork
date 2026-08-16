import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';

export type Sqlite = Database.Database;

export function createDatabase(filename = process.env.AIWORK_DATABASE ?? 'data/aiwork.db') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  migrate(sqlite);
  seed(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

function migrate(db: Sqlite) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, name TEXT NOT NULL, project_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS actors (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, kind TEXT NOT NULL, instructions TEXT, capabilities_json TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS workflow_states (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, instructions TEXT, actor_id TEXT, UNIQUE(workflow_id,key));
    CREATE TABLE IF NOT EXISTS workflow_transitions (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, from_state_id TEXT NOT NULL, to_state_id TEXT NOT NULL, required_role TEXT);
    CREATE TABLE IF NOT EXISTS work_item_types (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, level INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS work_items (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, type_id TEXT NOT NULL, parent_id TEXT, project_id TEXT NOT NULL, workflow_id TEXT NOT NULL, state_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, ai_instructions TEXT, active_actor_id TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS work_items_parent_idx ON work_items(parent_id);
    CREATE INDEX IF NOT EXISTS work_items_project_idx ON work_items(project_id);
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL, body TEXT NOT NULL, author_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, storage_key TEXT NOT NULL, variants_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, work_item_id TEXT, actor_id TEXT, user_id TEXT, action TEXT NOT NULL, previous_state TEXT, new_state TEXT, correlation_id TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
  `);
}

function seed(db: Sqlite) {
  const now = new Date().toISOString();
  const insert = db.prepare('INSERT OR IGNORE INTO actors(id,name,role,kind,instructions,capabilities_json) VALUES(?,?,?,?,?,?)');
  insert.run('actor_planner', 'Product Owner', 'planner', 'human_or_ai', 'Clarify outcomes and acceptance criteria before work begins.', '["comment","create_child","transition"]');
  insert.run('actor_developer', 'Developer Agent', 'developer', 'ai', 'Implement with tests before transitioning to Test.', '["comment","create_child","transition","upload"]');
  insert.run('actor_tester', 'QA Agent', 'tester', 'ai', 'Verify acceptance criteria and record reproducible evidence.', '["comment","transition"]');
  insert.run('actor_release', 'Release Manager', 'release_manager', 'human_or_ai', 'Confirm release readiness and operational safety.', '["comment","transition"]');
  db.prepare('INSERT OR IGNORE INTO workflows VALUES(?,?,?,?,?)').run('wf_default', 'Default Workflow', null, now, now);
  const state = db.prepare('INSERT OR IGNORE INTO workflow_states VALUES(?,?,?,?,?,?,?)');
  state.run('state_ready','wf_default','ready','Ready',0,'Ensure scope and acceptance criteria are clear.','actor_planner');
  state.run('state_progress','wf_default','in_progress','In Progress',1,'Produce tested, reviewable implementation.','actor_developer');
  state.run('state_test','wf_default','test','Test',2,'Validate behavior and report failures precisely.','actor_tester');
  state.run('state_production','wf_default','production','Production',3,'Protect release stability and record deployment evidence.','actor_release');
  const transition = db.prepare('INSERT OR IGNORE INTO workflow_transitions VALUES(?,?,?,?,?)');
  transition.run('tr_ready_progress','wf_default','state_ready','state_progress',null);
  transition.run('tr_progress_test','wf_default','state_progress','state_test',null);
  transition.run('tr_test_progress','wf_default','state_test','state_progress',null);
  transition.run('tr_test_prod','wf_default','state_test','state_production',null);
  const type = db.prepare('INSERT OR IGNORE INTO work_item_types VALUES(?,?,?,?)');
  ['project','initiative','epic','story','task'].forEach((key, level) => type.run(`type_${key}`,key,key[0]!.toUpperCase()+key.slice(1),level));
  const item = db.prepare('INSERT OR IGNORE INTO work_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  item.run('proj_demo','DEMO','type_project',null,'proj_demo','wf_default','state_ready','AIWork Demo','Starter project','Build securely with strict TypeScript.','actor_planner',1,now,now);
  item.run('story_demo','DEMO-1','type_story','proj_demo','proj_demo','wf_default','state_ready','Explore AI context','Inspect inherited instructions and available tools.','Keep this story concise and verifiable.','actor_planner',1,now,now);
}
