import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { ServerOptions } from 'node:https';
import { createDatabase } from './db/index.js';
import { AiContextService } from './services/ai-context.js';
import { AttachmentService, LocalStorage } from './services/attachments.js';
import { DomainError, WorkflowService } from './services/workflow.js';
import { registerGui } from './gui.js';

const errorSchema = { type:'object', properties:{ error:{ type:'object', properties:{ code:{type:'string'}, message:{type:'string'}, details:{type:'object',additionalProperties:true} } } } } as const;
const idParams = { type:'object', required:['id'], properties:{id:{type:'string'}} } as const;

export function buildApp(options: { database?: string; uploadRoot?: string; https?: ServerOptions } = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', genReqId: () => randomUUID(), ...(options.https ? { https: options.https } : {}) });
  const { sqlite } = createDatabase(options.database);
  const contexts = new AiContextService(sqlite);
  const workflows = new WorkflowService(sqlite);
  const files = new AttachmentService(new LocalStorage(options.uploadRoot ?? resolve('uploads')));
  app.decorate('sqlite', sqlite);

  app.register(cors, { origin: process.env.AIWORK_ORIGIN ?? 'http://localhost:5173' });
  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  app.register(swagger, { openapi: { info: { title:'AIWork API', version:'0.1.0', description:'AI-native work management API' }, components:{ securitySchemes:{ bearerAuth:{type:'http',scheme:'bearer'} } } } });
  app.register(swaggerUi, { routePrefix:'/docs' });

  app.addHook('preHandler', async (request, reply) => {
    if (['POST','PUT','PATCH','DELETE'].includes(request.method)) {
      const token = request.headers.authorization?.replace(/^Bearer\s+/i,'');
      if (token !== (process.env.AIWORK_API_TOKEN ?? 'dev-token')) return reply.code(401).send({ error:{ code:'UNAUTHENTICATED',message:'A valid bearer token is required.',details:{} } });
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) return reply.code(error.status).send({ error:{ code:error.code,message:error.message,details:error.details } });
    const validationError = error as Error & { validation?: unknown };
    if (validationError.validation) return reply.code(400).send({ error:{ code:'VALIDATION_ERROR',message:validationError.message,details:{ validation:validationError.validation } } });
    app.log.error(error); return reply.code(500).send({ error:{ code:'INTERNAL_ERROR',message:'An unexpected error occurred.',details:{} } });
  });
  app.addHook('onClose', async () => sqlite.close());

  app.get('/health', async () => ({ status:'ok' }));
  app.get('/v1/ai', { schema:{ tags:['AI'], summary:'Discover AIWork capabilities' } }, async () => {
    const projects = sqlite.prepare(`SELECT id,key,title FROM work_items WHERE parent_id IS NULL`).all();
    const actors = sqlite.prepare(`SELECT id,name,role,kind,capabilities_json AS capabilities FROM actors`).all().map((a) => ({...(a as object), capabilities:JSON.parse((a as {capabilities:string}).capabilities)}));
    return { name:'AIWork', version:'v1', capabilities:['hierarchical_context','workflow_transitions','comments','attachments','optimistic_locking'], entryPoints:{ openapi:'/docs/json', workItemContext:'/v1/work-items/{id}/ai' }, projects, actors };
  });
  app.get('/v1/work-items', { schema:{ tags:['Work items'] } }, async (request) => {
    const query = request.query as { projectId?:string };
    return sqlite.prepare(`SELECT w.id,w.key,w.parent_id AS parentId,w.title,w.version,t.key AS type,s.key AS status,a.name AS actor FROM work_items w JOIN work_item_types t ON t.id=w.type_id JOIN workflow_states s ON s.id=w.state_id LEFT JOIN actors a ON a.id=w.active_actor_id WHERE (? IS NULL OR w.project_id=?) ORDER BY t.level,w.created_at`).all(query.projectId ?? null,query.projectId ?? null);
  });
  app.get('/v1/work-items/:id/ai', { schema:{ tags:['AI'],params:idParams,querystring:{type:'object',properties:{mode:{type:'string',enum:['compact','full'],default:'compact'},max_tokens:{type:'integer',minimum:32}}} } }, async (request,reply) => {
    const { id } = request.params as {id:string}; const q=request.query as {mode?:'compact'|'full';max_tokens?:number};
    const value=contexts.get(id,q.mode ?? 'compact',q.max_tokens); return value ?? reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{id}}});
  });
  app.patch('/v1/work-items/:id', { schema:{ tags:['Work items'],security:[{bearerAuth:[]}],params:idParams,body:{type:'object',additionalProperties:false,properties:{title:{type:'string',minLength:1},description:{type:'string'},aiInstructions:{type:'string'},expectedVersion:{type:'integer'}},required:['expectedVersion']} } }, async (request,reply) => {
    const body=request.body as {title?:string;description?:string;aiInstructions?:string;expectedVersion:number;status?:never}; const {id}=request.params as {id:string};
    const existing=sqlite.prepare('SELECT * FROM work_items WHERE id=?').get(id) as Record<string,unknown>|undefined;
    if(!existing) return reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{id}}});
    const result=sqlite.prepare('UPDATE work_items SET title=?,description=?,ai_instructions=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(body.title??existing.title,body.description??existing.description,body.aiInstructions??existing.ai_instructions,new Date().toISOString(),id,body.expectedVersion);
    if(!result.changes) throw new DomainError(412,'STALE_WORK_ITEM','The work item has changed. Refresh and retry.',{expectedVersion:body.expectedVersion,actualVersion:existing.version});
    sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,null,'dev-user','work_item.update',null,null,request.id,JSON.stringify({fields:Object.keys(body).filter(k=>k!=='expectedVersion')}),new Date().toISOString());
    return {id,version:body.expectedVersion+1};
  });
  app.post('/v1/work-items/:id/transition', { schema:{ tags:['Workflow'],security:[{bearerAuth:[]}],params:idParams,body:{type:'object',required:['toState','expectedVersion'],additionalProperties:false,properties:{toState:{type:'string'},expectedVersion:{type:'integer'}}},response:{400:errorSchema,412:errorSchema} } }, async (request) => {
    const {id}=request.params as {id:string}; const body=request.body as {toState:string;expectedVersion:number};
    return workflows.transition(id,body.toState,body.expectedVersion,{userId:'dev-user'},request.id);
  });
  app.post('/v1/work-items/:id/comments', { schema:{ tags:['Comments'],security:[{bearerAuth:[]}],params:idParams,body:{type:'object',required:['body'],properties:{body:{type:'string',minLength:1}}} } }, async (request) => {
    const {id:workItemId}=request.params as {id:string}; const body=request.body as {body:string}; const id=randomUUID(),now=new Date().toISOString();
    sqlite.transaction(()=>{sqlite.prepare('INSERT INTO comments VALUES(?,?,?,?,?)').run(id,workItemId,body.body,'dev-user',now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),workItemId,null,'dev-user','comment.create',null,null,request.id,'{}',now);})(); return {id,workItemId,createdAt:now};
  });
  app.post('/v1/work-items/:id/attachments', { schema:{ tags:['Attachments'],security:[{bearerAuth:[]}],params:idParams,consumes:['multipart/form-data'] } }, async (request,reply) => {
    const {id:workItemId}=request.params as {id:string}; const part=await request.file(); if(!part)return reply.code(400).send({error:{code:'FILE_REQUIRED',message:'A multipart file is required.',details:{}}});
    const bytes=await part.toBuffer(),id=randomUUID(),processed=await files.process(id,part.filename,part.mimetype,bytes),now=new Date().toISOString();
    sqlite.transaction(()=>{sqlite.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').run(id,workItemId,part.filename,part.mimetype,processed.size,processed.storageKey,JSON.stringify(processed.variants),now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),workItemId,null,'dev-user','attachment.create',null,null,request.id,JSON.stringify({attachmentId:id}),now);})(); return reply.code(201).send({id,...processed});
  });
  app.get('/v1/workflows/:id', async (request,reply) => { const {id}=request.params as {id:string}; const workflow=sqlite.prepare('SELECT id,name FROM workflows WHERE id=?').get(id); if(!workflow)return reply.code(404).send(); return { ...workflow as object, states:sqlite.prepare('SELECT id,key,name,position,actor_id AS actorId FROM workflow_states WHERE workflow_id=? ORDER BY position').all(id), transitions:sqlite.prepare('SELECT id,from_state_id AS source,to_state_id AS target FROM workflow_transitions WHERE workflow_id=?').all(id) }; });
  registerGui(app,sqlite,contexts);
  return app;
}
