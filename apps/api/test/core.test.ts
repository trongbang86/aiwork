import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';

describe('AIWork core flows', () => {
  let app: FastifyInstance;
  let output: string;
  beforeEach(async () => { output=await mkdtemp(join(tmpdir(),'aiwork-')); app=buildApp({database:':memory:',uploadRoot:output}); await app.ready(); });
  afterEach(async () => app.close());

  it('merges hierarchy, state, and active actor instructions in exact order', async () => {
    const db=(app as unknown as {sqlite:import('better-sqlite3').Database}).sqlite; const now=new Date().toISOString();
    const insert=db.prepare('INSERT INTO work_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run('init_1','DEMO-I','type_initiative','proj_demo','proj_demo','wf_default','state_ready','Initiative',null,'Initiative rules','actor_planner',1,now,now);
    insert.run('epic_1','DEMO-E','type_epic','init_1','proj_demo','wf_default','state_ready','Epic',null,'Epic rules','actor_planner',1,now,now);
    insert.run('story_1','DEMO-S','type_story','epic_1','proj_demo','wf_default','state_ready','Story',null,'Story rules','actor_planner',1,now,now);
    const moved=await app.inject({method:'POST',url:'/v1/work-items/story_1/transition',headers:{authorization:'Bearer dev-token'},payload:{toState:'in_progress',expectedVersion:1}}); expect(moved.statusCode).toBe(200);
    const response=await app.inject('/v1/work-items/story_1/ai?mode=full'); const body=response.json();
    expect(body.context.provenance.map((x:{level:string})=>x.level)).toEqual(['project','initiative','epic','story','state','actor']);
    expect(body.effectiveInstructions).toContain('Implement with tests'); expect(body.workItem.status).toBe('in_progress');
  });

  it('rejects invalid transitions with actionable details', async () => {
    const response=await app.inject({method:'POST',url:'/v1/work-items/story_demo/transition',headers:{authorization:'Bearer dev-token'},payload:{toState:'production',expectedVersion:1}});
    expect(response.statusCode).toBe(400); expect(response.json().error).toMatchObject({code:'INVALID_WORKFLOW_TRANSITION',details:{allowedTransitions:['in_progress']}});
  });

  it('rejects stale optimistic updates', async () => {
    const request={method:'PATCH' as const,url:'/v1/work-items/story_demo',headers:{authorization:'Bearer dev-token'},payload:{title:'Changed',expectedVersion:1}};
    expect((await app.inject(request)).statusCode).toBe(200); const stale=await app.inject(request); expect(stale.statusCode).toBe(412); expect(stale.json().error.code).toBe('STALE_WORK_ITEM');
  });

  it('creates projects, stories, and comments through the documented REST flow', async () => {
    const auth={authorization:'Bearer dev-token'};
    const project=await app.inject({method:'POST',url:'/v1/projects',headers:auth,payload:{key:'NEW',title:'New project',aiInstructions:'Project rules'}});
    expect(project.statusCode).toBe(201); const projectBody=project.json();
    const story=await app.inject({method:'POST',url:'/v1/work-items',headers:auth,payload:{parentId:projectBody.id,type:'story',title:'First story',description:'Useful detail'}});
    expect(story.statusCode).toBe(201); expect(story.json()).toMatchObject({key:'NEW-1',type:'story',status:'ready'});
    const comment=await app.inject({method:'POST',url:`/v1/work-items/${story.json().id}/comments`,headers:auth,payload:{body:'Acceptance evidence'}});
    expect(comment.statusCode).toBe(200);
    const found=await app.inject(`/v1/work-items?q=NEW-1`); expect(found.json()).toHaveLength(1);
    const context=await app.inject(`/v1/work-items/${story.json().id}/ai?mode=full`);expect(context.json().details.comments[0].body).toBe('Acceptance evidence');
    const comments=await app.inject(`/v1/work-items/${story.json().id}/comments`);expect(comments.json()[0].body).toBe('Acceptance evidence');
  });

  it('does not expose AI instructions in the project list', async () => {
    const projects=(await app.inject('/v1/projects')).json() as Record<string,unknown>[];
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]).toMatchObject({id:'proj_demo',key:'DEMO',title:'AIWork Demo'});
    expect(projects[0]).not.toHaveProperty('aiInstructions');
    expect(projects[0]).not.toHaveProperty('itemCount');
  });

  it('gets one project by key or ID with its AI instructions', async () => {
    const byKey=await app.inject('/v1/projects/GAMES');
    expect(byKey.statusCode).toBe(200);
    expect(byKey.json()).toMatchObject({id:'proj_games',key:'GAMES',aiInstructions:expect.any(String)});
    expect((await app.inject('/v1/projects/proj_games')).json()).toEqual(byKey.json());
    const missing=await app.inject('/v1/projects/UNKNOWN');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('gives an LLM a discoverable, executable story-query flow', async () => {
    const discovery=(await app.inject('/v1/ai')).json();
    expect(discovery.entryPoints.listOrSearchWorkItems).toContain('?q=');
    expect(discovery.suggestedFlow).toContain('GET /v1/work-items/{id}/ai?mode=full');
    const context=(await app.inject('/v1/work-items/story_demo/ai?mode=full')).json();
    expect(context.apiSchema.tools.map((tool:{name:string})=>tool.name)).toContain('create_child');
  });

  it('optimizes images and generates all responsive WebP/AVIF variants', async () => {
    const image=await sharp({create:{width:1200,height:800,channels:3,background:'#6750a4'}}).png().toBuffer();
    const boundary='aiworkboundary'; const prefix=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n`); const suffix=Buffer.from(`\r\n--${boundary}--\r\n`);
    const response=await app.inject({method:'POST',url:'/v1/work-items/story_demo/attachments',headers:{authorization:'Bearer dev-token','content-type':`multipart/form-data; boundary=${boundary}`},payload:Buffer.concat([prefix,image,suffix])});
    expect(response.statusCode).toBe(201); const result=response.json(); expect(Object.keys(result.variants)).toEqual(['thumbnail','small','medium','large']);
    const generated=await readdir(join(output,result.id)); expect(generated).toHaveLength(9);
  });

  it('serves distinct URL-based GUI views', async () => {
    for (const url of ['/projects','/search?q=Explore','/projects/proj_demo/board','/projects/proj_demo/hierarchy','/work-items/story_demo','/workflows/wf_default/designer']) {
      const response=await app.inject(url); expect(response.statusCode,url).toBe(200); expect(response.headers['content-type']).toContain('text/html');
    }
    const board=(await app.inject('/projects/proj_demo/board')).body;
    expect(board).toContain('Flow board'); expect(board).toContain('Add work item');
    expect((await app.inject('/search?q=Explore')).body).toContain('DEMO-1');
    expect((await app.inject('/work-items/story_demo')).body).toContain('Effective AI context');
  });
});
