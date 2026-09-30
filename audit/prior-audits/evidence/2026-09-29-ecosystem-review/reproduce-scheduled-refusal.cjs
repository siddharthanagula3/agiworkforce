const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root='/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e';
const ts = createRequire(root+'/apps/web/package.json')('typescript');
const path=root+'/apps/web/lib/services/schedule-service.ts';
const source=fs.readFileSync(path,'utf8');
const begin=source.indexOf('async function runClaimedSchedule(');
const end=source.indexOf('\nasync function findExpiredClaims(',begin);
if(begin<0||end<0) throw Error('function boundaries missing');
const code=ts.transpileModule(source.slice(begin,end)+'\nthis.invoke = runClaimedSchedule;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const notifications=[];
const context={AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,Promise,Date,
 creditCapMicrousdOf:()=>null,detectMissedExecution:()=>null,checkScheduleCondition:async()=>null,
 runWithinScheduleRun:async(_scope,fn)=>await fn(),
 finalizeScheduleRun:async(_db,claim,input)=>({id:claim.runId,...input}),
 announceScheduleRun:async(_db,_claim,status)=>{notifications.push(status);},
 captureWorkerFailure:()=>{},errorMessage:e=>String(e),
};
vm.createContext(context);vm.runInContext(code,context);
(async()=>{
 const refusal={text:'Scheduled execution skipped: subscription inactive',model:'auto',billingStatus:'subscription_inactive'};
 const run=await context.invoke({}, {runId:'refusal-fixture',task:{id:'task-fixture',userId:'user-fixture'},scope:{userId:'user-fixture'}},async()=>refusal,{timeoutMs:1000});
 const result={source:path,sha256:crypto.createHash('sha256').update(source).digest('hex'),extracted_function:'runClaimedSchedule',actual_executor_result_shape:refusal,result:run,announced_statuses:notifications,proves:'The unchanged run finalizer classifies a policy-refusal return as success; full deployment and real DB not exercised.'};
 fs.writeFileSync('/private/tmp/agi-ecosystem-audit-20260929/scheduled-refusal-reproduction.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
 if(run.status!=='success'||notifications[0]!=='success')process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
