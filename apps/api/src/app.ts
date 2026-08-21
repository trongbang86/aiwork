import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
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
  const uploadRoot = resolve(options.uploadRoot ?? 'uploads');
  const files = new AttachmentService(new LocalStorage(uploadRoot));
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
    return { name:'AIWork', version:'v1', description:'Create and manage hierarchical projects, initiatives, epics, stories, and tasks.', authentication:{ type:'bearer', requiredFor:['POST','PUT','PATCH','DELETE'], developmentToken:'dev-token' }, capabilities:['project_creation','work_item_creation','hierarchical_context','workflow_transitions','comments','attachments','optimistic_locking'], entryPoints:{ openapi:'/docs/json', listOrSearchWorkItems:'/v1/work-items?q={key-or-title}', workItem:'/v1/work-items/{id}', workItemContext:'/v1/work-items/{id}/ai?mode=full' }, suggestedFlow:['GET /v1/work-items?q=DEMO-1','GET /v1/work-items/{id}/ai?mode=full','Use one of apiSchema.tools with Authorization: Bearer <token>'], projects, actors };
  });
  app.get('/v1/projects',{schema:{tags:['Projects'],summary:'List projects'}},async()=>sqlite.prepare(`SELECT w.id,w.key,w.title,w.description,w.version FROM work_items w JOIN work_item_types t ON t.id=w.type_id WHERE t.key='project' ORDER BY w.created_at`).all());
  app.get('/v1/projects/:id', { schema:{tags:['Projects'],summary:'Get a project by ID or key',params:idParams} }, async(request,reply) => {
    const {id}=request.params as {id:string};
    const project=sqlite.prepare(`SELECT w.id,w.key,w.title,w.description,w.version,(SELECT count(*) FROM work_items x WHERE x.project_id=w.id) AS itemCount FROM work_items w JOIN work_item_types t ON t.id=w.type_id WHERE t.key='project' AND (w.id=? OR w.key=? COLLATE NOCASE)`).get(id,id);
    return project??reply.code(404).send({error:{code:'PROJECT_NOT_FOUND',message:'Project was not found.',details:{id}}});
  });
  app.get('/v1/projects/:id/ai', { schema:{tags:['AI','Projects'],summary:'Get project AI instructions by ID or key',params:idParams} }, async(request,reply) => {
    const {id}=request.params as {id:string};
    const project=sqlite.prepare(`SELECT w.id,w.key,w.ai_instructions AS aiInstructions FROM work_items w JOIN work_item_types t ON t.id=w.type_id WHERE t.key='project' AND (w.id=? OR w.key=? COLLATE NOCASE)`).get(id,id);
    return project??reply.code(404).send({error:{code:'PROJECT_NOT_FOUND',message:'Project was not found.',details:{id}}});
  });
  app.get('/v1/actors', { schema:{tags:['Actors'],summary:'List actors'} }, async() => sqlite.prepare(`SELECT id,name,role,kind,capabilities_json AS capabilities FROM actors ORDER BY name`).all().map((actor) => ({...(actor as object),capabilities:JSON.parse((actor as {capabilities:string}).capabilities)})));
  app.get('/v1/actors/:id', { schema:{tags:['Actors'],summary:'Get actor by ID or name',params:idParams} }, async(request,reply) => {
    const {id}=request.params as {id:string};const actor=sqlite.prepare(`SELECT id,name,role,kind,capabilities_json AS capabilities FROM actors WHERE id=? OR name=? COLLATE NOCASE`).get(id,id) as ({capabilities:string}&Record<string,unknown>)|undefined;
    return actor?{...actor,capabilities:JSON.parse(actor.capabilities)}:reply.code(404).send({error:{code:'ACTOR_NOT_FOUND',message:'Actor was not found.',details:{id}}});
  });
  app.get('/v1/actors/:id/ai', { schema:{tags:['AI','Actors'],summary:'Get actor AI instructions by ID or name',params:idParams} }, async(request,reply) => {
    const {id}=request.params as {id:string};const actor=sqlite.prepare(`SELECT id,name,instructions AS aiInstructions FROM actors WHERE id=? OR name=? COLLATE NOCASE`).get(id,id);
    return actor??reply.code(404).send({error:{code:'ACTOR_NOT_FOUND',message:'Actor was not found.',details:{id}}});
  });

  type HierarchyParams = {project:string;initiative?:string;epic?:string;story?:string};
  type HierarchyRow = {id:string;key:string};
  const hierarchyItem=(parentId:string|null,id:string,type:string) => sqlite.prepare(`SELECT w.id,w.key FROM work_items w JOIN work_item_types t ON t.id=w.type_id WHERE t.key=? AND w.parent_id IS ? AND (w.id=? OR w.key=? COLLATE NOCASE)`).get(type,parentId,id,id) as HierarchyRow|undefined;
  const hierarchyParent=(params:HierarchyParams,level:'initiative'|'epic'|'story') => {
    const project=hierarchyItem(null,params.project,'project'); if(!project)return {error:'PROJECT_NOT_FOUND',id:params.project};
    if(level==='initiative')return {parent:project};
    const initiative=hierarchyItem(project.id,params.initiative!,'initiative'); if(!initiative)return {error:'INITIATIVE_NOT_FOUND',id:params.initiative!};
    if(level==='epic')return {parent:initiative};
    const epic=hierarchyItem(initiative.id,params.epic!,'epic'); if(!epic)return {error:'EPIC_NOT_FOUND',id:params.epic!};
    return {parent:epic};
  };
  const hierarchyTarget=(params:HierarchyParams,level:'initiative'|'epic'|'story') => {const resolved=hierarchyParent(params,level);if(!resolved.parent)return undefined;return hierarchyItem(resolved.parent.id,params[level]!,level);};
  const updateResource=(id:string,body:{title?:string;description?:string;aiInstructions?:string;expectedVersion:number},requestId:string) => {const existing=sqlite.prepare('SELECT * FROM work_items WHERE id=?').get(id) as Record<string,unknown>;const result=sqlite.prepare('UPDATE work_items SET title=?,description=?,ai_instructions=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(body.title??existing.title,body.description??existing.description,body.aiInstructions??existing.ai_instructions,new Date().toISOString(),id,body.expectedVersion);if(!result.changes)throw new DomainError(412,'STALE_WORK_ITEM','The work item has changed. Refresh and retry.',{expectedVersion:body.expectedVersion,actualVersion:existing.version});sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,null,'dev-user','work_item.update',null,null,requestId,JSON.stringify({fields:Object.keys(body).filter(k=>k!=='expectedVersion')}),new Date().toISOString());return {id,version:body.expectedVersion+1};};
  const registerResourceExtras=(path:string,locate:(params:HierarchyParams)=>HierarchyRow|undefined) => {
    app.put(path,{schema:{tags:['Work items'],security:[{bearerAuth:[]}]}},async(request,reply)=>{const item=locate(request.params as HierarchyParams);if(!item)return reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{}}});return updateResource(item.id,request.body as {title?:string;description?:string;aiInstructions?:string;expectedVersion:number},request.id);});
    app.get(`${path}/comments`,async(request,reply)=>{const item=locate(request.params as HierarchyParams);if(!item)return reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{}}});return sqlite.prepare('SELECT id,work_item_id AS workItemId,body,author_id AS authorId,created_at AS createdAt FROM comments WHERE work_item_id=? ORDER BY created_at,id').all(item.id);});
    app.post(`${path}/comments`,{schema:{tags:['Comments'],security:[{bearerAuth:[]}]}},async(request,reply)=>{const item=locate(request.params as HierarchyParams);if(!item)return reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{}}});const body=request.body as {body:string};if(!body.body?.trim())throw new DomainError(400,'VALIDATION_ERROR','Comment body is required.',{});const id=randomUUID(),now=new Date().toISOString();sqlite.transaction(()=>{sqlite.prepare('INSERT INTO comments VALUES(?,?,?,?,?)').run(id,item.id,body.body,'dev-user',now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),item.id,null,'dev-user','comment.create',null,null,request.id,'{}',now);})();return {id,workItemId:item.id,createdAt:now};});
    app.get(`${path}/pictures`,async(request,reply)=>{const item=locate(request.params as HierarchyParams);if(!item)return reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{}}});return (sqlite.prepare('SELECT id,work_item_id AS workItemId,filename,mime_type AS mimeType,size,variants_json AS variants,created_at AS createdAt FROM attachments WHERE work_item_id=? AND mime_type LIKE ? ORDER BY created_at,id').all(item.id,'image/%') as Array<Record<string,unknown>&{variants:string}>).map(x=>({...x,variants:JSON.parse(x.variants)}));});
    app.post(`${path}/pictures`,{schema:{tags:['Attachments'],security:[{bearerAuth:[]}],consumes:['multipart/form-data']}},async(request,reply)=>{const item=locate(request.params as HierarchyParams);if(!item)return reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{}}});const part=await request.file();if(!part||!part.mimetype.startsWith('image/'))return reply.code(400).send({error:{code:'IMAGE_REQUIRED',message:'A multipart image file is required.',details:{}}});const bytes=await part.toBuffer(),id=randomUUID(),processed=await files.process(id,part.filename,part.mimetype,bytes),now=new Date().toISOString();sqlite.transaction(()=>{sqlite.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').run(id,item.id,part.filename,part.mimetype,processed.size,processed.storageKey,JSON.stringify(processed.variants),now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),item.id,null,'dev-user','attachment.create',null,null,request.id,JSON.stringify({attachmentId:id}),now);})();return reply.code(201).send({id,...processed});});
  };
  registerResourceExtras('/v1/projects/:project',params=>hierarchyItem(null,params.project,'project'));
  const hierarchyRoutes = [
    {level:'initiative',plural:'initiatives',path:'/v1/projects/:project/initiatives'},
    {level:'epic',plural:'epics',path:'/v1/projects/:project/initiatives/:initiative/epics'},
    {level:'story',plural:'stories',path:'/v1/projects/:project/initiatives/:initiative/epics/:epic/stories'}
  ] as const;
  for(const route of hierarchyRoutes){
    app.post(route.path,{schema:{tags:['Work items'],security:[{bearerAuth:[]}]}},async(request,reply)=>{const params=request.params as HierarchyParams,resolved=hierarchyParent(params,route.level);if(!resolved.parent)return reply.code(404).send({error:{code:resolved.error,message:'Hierarchy parent was not found.',details:{id:resolved.id}}});const body=request.body as {key?:string;title:string;description?:string;aiInstructions?:string};if(!body.title?.trim())throw new DomainError(400,'VALIDATION_ERROR','Title is required.',{});const parent=sqlite.prepare('SELECT * FROM work_items WHERE id=?').get(resolved.parent.id) as Record<string,unknown>;const type=sqlite.prepare('SELECT id FROM work_item_types WHERE key=?').get(route.level) as {id:string};const initial=sqlite.prepare('SELECT id,actor_id FROM workflow_states WHERE workflow_id=? ORDER BY position LIMIT 1').get(parent.workflow_id) as {id:string;actor_id:string|null};const id=randomUUID(),key=body.key??nextKey(sqlite,String(parent.project_id)),now=new Date().toISOString();sqlite.transaction(()=>{sqlite.prepare('INSERT INTO work_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,key,type.id,parent.id,parent.project_id,parent.workflow_id,initial.id,body.title,body.description??null,body.aiInstructions??null,initial.actor_id,1,now,now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,null,'dev-user','work_item.create',null,null,request.id,JSON.stringify({parentId:parent.id,type:route.level}),now);})();return reply.code(201).send({id,key,parentId:parent.id,type:route.level,version:1});});
    app.get(route.path,{schema:{tags:['Work items'],summary:`List ${route.plural} in their hierarchy`}},async(request,reply)=>{
      const params=request.params as HierarchyParams;const resolved=hierarchyParent(params,route.level);
      if(!resolved.parent)return reply.code(404).send({error:{code:resolved.error,message:'Hierarchy parent was not found.',details:{id:resolved.id}}});
      return sqlite.prepare(`SELECT w.id,w.key,w.title,w.description,w.version FROM work_items w JOIN work_item_types t ON t.id=w.type_id WHERE w.parent_id=? AND t.key=? ORDER BY w.created_at`).all(resolved.parent.id,route.level);
    });
    app.get(`${route.path}/:${route.level}`,{schema:{tags:['Work items'],summary:`Get ${route.level} by ID or key`}},async(request,reply)=>{
      const params=request.params as HierarchyParams;const resolved=hierarchyParent(params,route.level);
      if(!resolved.parent)return reply.code(404).send({error:{code:resolved.error,message:'Hierarchy parent was not found.',details:{id:resolved.id}}});
      const id=params[route.level]!;const item=sqlite.prepare(`SELECT w.id,w.key,w.title,w.description,w.version,(SELECT count(*) FROM work_items x WHERE x.parent_id=w.id) AS itemCount FROM work_items w JOIN work_item_types t ON t.id=w.type_id WHERE w.parent_id=? AND t.key=? AND (w.id=? OR w.key=? COLLATE NOCASE)`).get(resolved.parent.id,route.level,id,id);
      return item??reply.code(404).send({error:{code:`${route.level.toUpperCase()}_NOT_FOUND`,message:`${route.level} was not found.`,details:{id}}});
    });
    app.get(`${route.path}/:${route.level}/ai`,{schema:{tags:['AI','Work items'],summary:`Get ${route.level} AI instructions`}},async(request,reply)=>{
      const params=request.params as HierarchyParams;const resolved=hierarchyParent(params,route.level);
      if(!resolved.parent)return reply.code(404).send({error:{code:resolved.error,message:'Hierarchy parent was not found.',details:{id:resolved.id}}});
      const id=params[route.level]!;const item=sqlite.prepare(`SELECT w.id,w.key,w.ai_instructions AS aiInstructions FROM work_items w JOIN work_item_types t ON t.id=w.type_id WHERE w.parent_id=? AND t.key=? AND (w.id=? OR w.key=? COLLATE NOCASE)`).get(resolved.parent.id,route.level,id,id);
      return item??reply.code(404).send({error:{code:`${route.level.toUpperCase()}_NOT_FOUND`,message:`${route.level} was not found.`,details:{id}}});
    });
    registerResourceExtras(`${route.path}/:${route.level}`,params=>hierarchyTarget(params,route.level));
  }
  app.get('/v1/work-items', { schema:{ tags:['Work items'],summary:'List or search work items',querystring:{type:'object',properties:{projectId:{type:'string'},q:{type:'string'},type:{type:'string'}}} } }, async (request) => {
    const query = request.query as { projectId?:string;q?:string;type?:string }; const search=query.q ? `%${query.q}%` : null;
    return sqlite.prepare(`SELECT w.id,w.key,w.parent_id AS parentId,w.project_id AS projectId,w.title,w.description,w.ai_instructions AS aiInstructions,w.version,t.key AS type,s.key AS status,a.name AS actor FROM work_items w JOIN work_item_types t ON t.id=w.type_id JOIN workflow_states s ON s.id=w.state_id LEFT JOIN actors a ON a.id=w.active_actor_id WHERE (? IS NULL OR w.project_id=?) AND (? IS NULL OR t.key=?) AND (? IS NULL OR w.key LIKE ? OR w.title LIKE ?) ORDER BY t.level,w.created_at`).all(query.projectId??null,query.projectId??null,query.type??null,query.type??null,search,search,search);
  });
  app.get('/v1/work-items/:id', { schema:{tags:['Work items'],summary:'Get a work item',params:idParams} }, async(request,reply)=>{const {id}=request.params as {id:string};const item=sqlite.prepare(`SELECT w.id,w.key,w.parent_id AS parentId,w.project_id AS projectId,w.title,w.description,w.ai_instructions AS aiInstructions,w.version,t.key AS type,s.key AS status,a.name AS actor FROM work_items w JOIN work_item_types t ON t.id=w.type_id JOIN workflow_states s ON s.id=w.state_id LEFT JOIN actors a ON a.id=w.active_actor_id WHERE w.id=?`).get(id);return item??reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{id}}});});
  app.post('/v1/projects', { schema:{tags:['Projects'],summary:'Create a project',security:[{bearerAuth:[]}],body:{type:'object',additionalProperties:false,required:['key','title'],properties:{key:{type:'string',minLength:1},title:{type:'string',minLength:1},description:{type:'string'},aiInstructions:{type:'string'},workflowId:{type:'string',default:'wf_default'}}}} }, async(request,reply)=>{
    const body=request.body as {key:string;title:string;description?:string;aiInstructions?:string;workflowId?:string}; const id=randomUUID(),now=new Date().toISOString(),workflowId=body.workflowId??'wf_default';
    const initial=sqlite.prepare('SELECT id,actor_id FROM workflow_states WHERE workflow_id=? ORDER BY position LIMIT 1').get(workflowId) as {id:string;actor_id:string|null}|undefined;if(!initial)throw new DomainError(400,'WORKFLOW_NOT_FOUND','Workflow has no initial state.',{workflowId});
    try{sqlite.transaction(()=>{sqlite.prepare('INSERT INTO work_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,body.key,'type_project',null,id,workflowId,initial.id,body.title,body.description??null,body.aiInstructions??null,initial.actor_id,1,now,now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,null,'dev-user','project.create',null,null,request.id,'{}',now);})();}catch(error){if(String(error).includes('UNIQUE'))throw new DomainError(409,'WORK_ITEM_KEY_EXISTS','That key is already in use.',{key:body.key});throw error;}return reply.code(201).send({id,key:body.key,type:'project',version:1});
  });
  app.post('/v1/work-items', { schema:{tags:['Work items'],summary:'Create a child work item',security:[{bearerAuth:[]}],body:{type:'object',additionalProperties:false,required:['parentId','type','title'],properties:{parentId:{type:'string'},type:{type:'string',enum:['initiative','epic','story','task','Initiative','Epic','Story','Task']},key:{type:'string',minLength:1},title:{type:'string',minLength:1},description:{type:'string'},aiInstructions:{type:'string'}}}} }, async(request,reply)=>{
    const body=request.body as {parentId:string;type:string;key?:string;title:string;description?:string;aiInstructions?:string};body.type=body.type.toLowerCase(); const parent=sqlite.prepare(`SELECT w.*,t.level parent_level FROM work_items w JOIN work_item_types t ON t.id=w.type_id WHERE w.id=?`).get(body.parentId) as Record<string,unknown>|undefined;if(!parent)throw new DomainError(400,'PARENT_NOT_FOUND','Parent work item was not found.',{parentId:body.parentId});const type=sqlite.prepare('SELECT id,level FROM work_item_types WHERE key=?').get(body.type) as {id:string;level:number};if(type.level<=Number(parent.parent_level))throw new DomainError(400,'INVALID_HIERARCHY','Child type must be below its parent type.',{parentTypeLevel:parent.parent_level,childType:body.type});
    const id=randomUUID(),now=new Date().toISOString(),key=body.key??nextKey(sqlite,String(parent.project_id));const initial=sqlite.prepare('SELECT id,actor_id FROM workflow_states WHERE workflow_id=? ORDER BY position LIMIT 1').get(parent.workflow_id) as {id:string;actor_id:string|null};
    try{sqlite.transaction(()=>{sqlite.prepare('INSERT INTO work_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,key,type.id,body.parentId,parent.project_id,parent.workflow_id,initial.id,body.title,body.description??null,body.aiInstructions??null,initial.actor_id,1,now,now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,null,'dev-user','work_item.create',null,null,request.id,JSON.stringify({parentId:body.parentId,type:body.type}),now);})();}catch(error){if(String(error).includes('UNIQUE'))throw new DomainError(409,'WORK_ITEM_KEY_EXISTS','That key is already in use.',{key});throw error;}return reply.code(201).send({id,key,parentId:body.parentId,projectId:parent.project_id,type:body.type,status:'ready',version:1});
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
    const {id:workItemId}=request.params as {id:string}; const body=request.body as {body:string};if(!sqlite.prepare('SELECT 1 FROM work_items WHERE id=?').get(workItemId))throw new DomainError(404,'WORK_ITEM_NOT_FOUND','Work item was not found.',{id:workItemId}); const id=randomUUID(),now=new Date().toISOString();
    sqlite.transaction(()=>{sqlite.prepare('INSERT INTO comments VALUES(?,?,?,?,?)').run(id,workItemId,body.body,'dev-user',now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),workItemId,null,'dev-user','comment.create',null,null,request.id,'{}',now);})(); return {id,workItemId,createdAt:now};
  });
  app.get('/v1/work-items/:id/comments',{schema:{tags:['Comments'],summary:'List comments on a work item',params:idParams}},async(request,reply)=>{const {id}=request.params as {id:string};if(!sqlite.prepare('SELECT 1 FROM work_items WHERE id=?').get(id))return reply.code(404).send({error:{code:'WORK_ITEM_NOT_FOUND',message:'Work item was not found.',details:{id}}});return sqlite.prepare('SELECT id,work_item_id AS workItemId,body,author_id AS authorId,created_at AS createdAt FROM comments WHERE work_item_id=? ORDER BY created_at,id').all(id);});
  app.post('/v1/work-items/:id/attachments', { schema:{ tags:['Attachments'],security:[{bearerAuth:[]}],params:idParams,consumes:['multipart/form-data'] } }, async (request,reply) => {
    const {id:workItemId}=request.params as {id:string}; const part=await request.file(); if(!part)return reply.code(400).send({error:{code:'FILE_REQUIRED',message:'A multipart file is required.',details:{}}});
    const bytes=await part.toBuffer(),id=randomUUID(),processed=await files.process(id,part.filename,part.mimetype,bytes),now=new Date().toISOString();
    sqlite.transaction(()=>{sqlite.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').run(id,workItemId,part.filename,part.mimetype,processed.size,processed.storageKey,JSON.stringify(processed.variants),now);sqlite.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),workItemId,null,'dev-user','attachment.create',null,null,request.id,JSON.stringify({attachmentId:id}),now);})(); return reply.code(201).send({id,...processed});
  });
  app.get('/v1/attachments/:id/content', async(request,reply)=>{const {id}=request.params as {id:string};const attachment=sqlite.prepare('SELECT mime_type AS mimeType,storage_key AS storageKey FROM attachments WHERE id=?').get(id) as {mimeType:string;storageKey:string}|undefined;if(!attachment)return reply.code(404).send({error:{code:'ATTACHMENT_NOT_FOUND',message:'Attachment was not found.',details:{id}}});const bytes=await readFile(resolve(uploadRoot,attachment.storageKey));return reply.type(attachment.mimeType.startsWith('image/')?'image/png':attachment.mimeType).send(bytes);});
  app.get('/v1/workflows/:id', async (request,reply) => { const {id}=request.params as {id:string}; const workflow=sqlite.prepare('SELECT id,name FROM workflows WHERE id=?').get(id); if(!workflow)return reply.code(404).send(); return { ...workflow as object, states:sqlite.prepare('SELECT id,key,name,position,actor_id AS actorId FROM workflow_states WHERE workflow_id=? ORDER BY position').all(id), transitions:sqlite.prepare('SELECT id,from_state_id AS source,to_state_id AS target FROM workflow_transitions WHERE workflow_id=?').all(id) }; });
  registerGui(app,sqlite,contexts);
  return app;
}

function nextKey(sqlite:ReturnType<typeof createDatabase>['sqlite'],projectId:string){const project=sqlite.prepare('SELECT key FROM work_items WHERE id=?').get(projectId) as {key:string};const rows=sqlite.prepare('SELECT key FROM work_items WHERE project_id=?').all(projectId) as Array<{key:string}>;let max=0;for(const row of rows){const match=row.key.match(new RegExp(`^${project.key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}-(\\d+)$`));if(match)max=Math.max(max,Number(match[1]));}return `${project.key}-${max+1}`;}
