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

  it('optimizes images and generates all responsive WebP/AVIF variants', async () => {
    const image=await sharp({create:{width:1200,height:800,channels:3,background:'#6750a4'}}).png().toBuffer();
    const boundary='aiworkboundary'; const prefix=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n`); const suffix=Buffer.from(`\r\n--${boundary}--\r\n`);
    const response=await app.inject({method:'POST',url:'/v1/work-items/story_demo/attachments',headers:{authorization:'Bearer dev-token','content-type':`multipart/form-data; boundary=${boundary}`},payload:Buffer.concat([prefix,image,suffix])});
    expect(response.statusCode).toBe(201); const result=response.json(); expect(Object.keys(result.variants)).toEqual(['thumbnail','small','medium','large']);
    const generated=await readdir(join(output,result.id)); expect(generated).toHaveLength(9);
  });

  it('serves distinct URL-based GUI views', async () => {
    for (const url of ['/projects','/projects/proj_demo/board','/projects/proj_demo/hierarchy','/work-items/story_demo','/workflows/wf_default/designer']) {
      const response=await app.inject(url); expect(response.statusCode,url).toBe(200); expect(response.headers['content-type']).toContain('text/html');
    }
    expect((await app.inject('/projects/proj_demo/board')).body).toContain('Flow board');
    expect((await app.inject('/work-items/story_demo')).body).toContain('Effective AI context');
  });
});
