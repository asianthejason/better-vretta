import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

test('image recovery includes unused and nested uploads, preserves records, and requires teacher access', async () => {
  const result = await build({entryPoints:['app/api/account-images/recover/route.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'backend',setup(b){b.onResolve({filter:/teacherBilling$/},()=>({path:'backend',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export function adminClient(){return globalThis.__imageRecoveryAdmin}',loader:'js'}));}}]});
  const scanned:string[]=[];
  const saved: Array<{image_path:string}>=[];
  let role='teacher';
  const admin={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(table:string){
    if(table==='profiles')return{select:()=>({eq:()=>({single:async()=>({data:{role}})})})};
    if (table === 'assessments') return {
      select: () => ({
        eq: (key: string, id: string) => {
          assert.equal(key, 'teacher_id');
          assert.equal(id, 'owner');
          return { order: () => ({ range: async () => ({ data: [{ id: 'owned' }] }) }) };
        },
      }),
    };
    return{upsert:async(rows:Array<{image_path:string}>,options:unknown)=>{assert.deepEqual(options,{onConflict:'owner_id,image_path',ignoreDuplicates:true});saved.push(...rows);return{error:null}}};
  },storage:{from:()=>({list:async(folder:string)=>{scanned.push(folder);return{data:folder==='owned'?[{id:'unused',name:'unused.png',created_at:'2026-01-01'},{id:null,name:'choices'}]:[{id:'nested',name:'old.png',created_at:'2026-01-01'}]};},getPublicUrl:(path:string)=>({data:{publicUrl:`https://example.test/${path}`}})})}};
  Object.assign(globalThis,{__imageRecoveryAdmin:admin});
  const {POST}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  assert.equal((await POST(new Request('http://localhost'))).status,401);
  const request=()=>new Request('http://localhost',{headers:{authorization:'Bearer token'}});
  assert.equal((await POST(request())).status,200);
  assert.deepEqual(scanned,['owned','owned/choices']);
  assert.deepEqual(saved.map(row=>row.image_path),['owned/unused.png','owned/choices/old.png']);
  role='student';
  assert.equal((await POST(request())).status,403);
  assert.equal(scanned.length,2);
});
