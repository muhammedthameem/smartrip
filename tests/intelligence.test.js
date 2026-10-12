import test from 'node:test';
import assert from 'node:assert/strict';
import {insights,suggestCategory} from '../src/lib/intelligence.js';
import {validateInput,extractOutput} from '../supabase/functions/smarttrip-ai/core.js';
import {createHandler} from '../supabase/functions/smarttrip-ai/handler.js';
test('cost insights exclude cancelled invoices and fuel-log duplicates',()=>{
 const result=insights({invoices:[{trip_id:'t',total_minor:1000},{status:'cancelled',total_minor:9000}],expenses:[{trip_id:'t',vehicle_id:'v',amount_minor:300}],maintenance:[{vehicle_id:'v',amount_minor:100}],fuel_logs:[{amount_minor:300}],trips:[{id:'t'},{id:'cancelled',status:'cancelled'}]});
 assert.equal(result.revenue,1000);assert.equal(result.cost,400);assert.equal(result.trips[0].cost,300);assert.equal(result.trips.length,1);assert.equal(result.vehicles[0].cost,400);
});
test('anomalies require comparable peers and use median rather than outlier mean',()=>{
 const expenses=[100,100,100,1000].map((amount_minor,id)=>({id,amount_minor,category:'Fuel'}));
 assert.deepEqual(insights({expenses}).warnings.map(w=>w.id),[3]);
 assert.equal(insights({expenses:expenses.slice(1)}).warnings.length,0);
 assert.equal(suggestCategory('FASTag payment'),'Toll');assert.equal(suggestCategory('unknown vendor'),'Other');
});
test('AI rejects arbitrary actions, remote document URLs and oversized inputs',()=>{
 for(const body of [{action:'delete'},{action:'scan',file:'https://evil.test/file'},{action:'draft',text:'x'.repeat(4001)},{action:'assistant',from:'2026-10-12',to:'2026-09-12'}])assert.throws(()=>validateInput(body));
 assert.equal(validateInput({action:'scan',file:'data:image/png;base64,YQ=='}).action,'scan');
 assert.throws(()=>extractOutput({status:'incomplete'}));
 assert.throws(()=>extractOutput({status:'completed',output:[{content:[{type:'refusal'}]}]}));
});
function fixture({role='admin',key=true,limited=false,providerStatus=200}={}){
 const calls=[];let payload;
 const db={auth:{getUser:async()=>({data:{user:{id:'u'}}})},from(table){calls.push(table);const q={select:()=>q,eq:(k,v)=>{calls.push([k,v]);return q;},single:async()=>({data:{org_id:'org-a',role}}),limit:async()=>({data:[{id:'c',name:'Client A'}]})};return q;},rpc:async(name)=>{calls.push(name);return name==='consume_ai_request'?{error:limited?{}:null}:{data:{invoices:[],all_payments:[]}};}};
 const handler=createHandler({env:name=>name==='OPENAI_API_KEY'?(key?'server-secret':null):'configured',createClient:(_url,_key,options)=>{calls.push(options);return db;},fetcher:async(_url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'No invoices in this period.'}]}]}),{status:providerStatus});}});
 return {handler,calls,get payload(){return payload;}};
}
const request=(body,auth=true)=>new Request('https://local.test',{method:'POST',headers:auth?{Authorization:'Bearer user-jwt'}:{},body:JSON.stringify(body)});
test('AI handler rejects unsigned and non-office requests before contacting provider',async()=>{
 let f=fixture();assert.equal((await f.handler(request({action:'status'},false))).status,401);assert.equal(f.payload,undefined);
 f=fixture({role:'driver'});assert.equal((await f.handler(request({action:'draft',text:'fuel'}))).status,403);assert.equal(f.payload,undefined);
});
test('missing secrets and rate limit fail closed',async()=>{
 let f=fixture({key:false});assert.equal((await f.handler(request({action:'draft'}))).status,503);assert.equal(f.payload,undefined);
 f=fixture({limited:true});assert.equal((await f.handler(request({action:'draft'}))).status,429);assert.equal(f.payload,undefined);
});
test('assistant forwards user JWT, scopes client names and sends no write tools',async()=>{
 const f=fixture();const r=await f.handler(request({action:'assistant',text:'Who owes money?',from:'2026-10-01',to:'2026-10-12'}));
 assert.equal(r.status,200);assert.equal((await r.json()).answer,'No invoices in this period.');
 assert.equal(f.calls[0].global.headers.Authorization,'Bearer user-jwt');assert.ok(f.calls.some(v=>Array.isArray(v)&&v[0]==='org_id'&&v[1]==='org-a'));
 assert.equal(f.payload.store,false);assert.equal(f.payload.tools,undefined);assert.ok(f.calls.includes('report_data'));
});
test('provider failure returns safe error without key or raw provider response',async()=>{
 const f=fixture({providerStatus:401});const r=await f.handler(request({action:'draft',text:'fuel'}));assert.equal(r.status,502);assert.ok(!(await r.text()).includes('server-secret'));
});
