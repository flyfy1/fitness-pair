import {pathToFileURL} from 'node:url';
import {SquatRecognizer} from '../../../packages/action-squat/index.js';
import {assertEvaluationResult} from '../../../contracts/index.js';
import {squatRobustnessCases} from './fixtures.mjs';

// Labels refer to input time at the authored return to standing. Match each
// completion once in [label, label + 650ms]; early and extra events are false.
export function matchCompletions(expected,observed,windowMs=650){
  const pending=[...observed],delays=[];let missed=0;
  for(const label of expected){
    const index=pending.findIndex(time=>time>=label&&time<=label+windowMs);
    if(index<0)missed++;else delays.push(pending.splice(index,1)[0]-label);
  }
  return {falseCompletions:pending.length,missedCompletions:missed,delays};
}
export function evaluateSquatCases(cases=squatRobustnessCases()){
  return cases.map(fixture=>{
    const recognizer=new SquatRecognizer();recognizer.reset(fixture.frames[0]);
    const outputs=fixture.frames.map(frame=>recognizer.update(frame));
    const observed=outputs.filter(frame=>frame.completion).map(frame=>frame.tMs);
    const matched=matchCompletions(fixture.expectedCompletions,observed);
    const sorted=[...matched.delays].sort((a,b)=>a-b),percentile=p=>sorted.length?sorted[Math.ceil(sorted.length*p)-1]:null;
    const result={version:1,runId:fixture.id+':'+outputs[0].recognizerId,fixtureId:fixture.id,evidence:'synthetic',modelId:fixture.frames[0].modelId,
      recognizerId:outputs[0].recognizerId,device:`Node ${process.version}; ${process.platform}/${process.arch}; authored geometry, no model inference`,
      expectedCount:fixture.expectedCompletions.length,observedCount:observed.length,falseCompletions:matched.falseCompletions,missedCompletions:matched.missedCompletions,
      matchingWindowMs:650,timing:{metric:'synthetic_event_delay_ms',p50Ms:percentile(.5),p95Ms:percentile(.95)}};
    assertEvaluationResult(result);
    return {...result,note:fixture.note,passed:result.falseCompletions===0&&result.missedCompletions===0};
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const results=evaluateSquatCases();console.log(JSON.stringify({evidence:'synthetic',results},null,2));
  if(results.some(result=>!result.passed))process.exitCode=1;
}
