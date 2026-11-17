import { selectionScope, resolvedLinkedConfiguration } from "./option-selection-bounds";
import { calculatePriceV2, completeAnonymousSelectionV2, DEFAULT_ENGINE_LIMITS, validateSelectionV2, validateGroupLevelsV2,
  type ConfigurationGroupV2 as ConfigurationGroup, type GroupSelectionV2 as GroupSelection,
  type OptionChoiceV2 as OptionChoice, type OptionGroupSelectionV2 as OptionGroupSelection, type OptionSelectionInstanceV2 as OptionSelectionInstance,
  type SizeGroupV2 as SizeGroup, type SizeGroupSelectionV2 as SizeGroupSelection, type PriceResultV2 as PriceResult,
  type ProductConfigurationContextV2 as ProductConfigurationContext, type ProductConfigurationV2, type ProductSelectionV2 } from "@menu/shared";
import type { PublicLinkedConfigurationSource, PublicProductConfigurationResponse } from "@/lib/api";
export type InstanceIdFactory=(prefix:string)=>string;
export class LatestQuoteGate { private generation=0;next(){return ++this.generation}invalidate(){++this.generation}isCurrent(n:number){return n===this.generation} }
export function publicConfigurationContext(restaurantSlug:string,sources:readonly PublicLinkedConfigurationSource[],currency:string): ProductConfigurationContext {
  return {catalogId:restaurantSlug,currency,linkedProducts:new Map(sources.map(s=>[s.productId,{productId:s.productId,catalogId:restaurantSlug,
    configuration:s.configuration,available:s.available,orderable:s.orderable}]))};
}
export const linkedConfiguration=resolvedLinkedConfiguration;
export function rebaseSelectionRevisions(selection:ProductSelectionV2,configuration:ProductConfigurationV2,
  sources:ReadonlyMap<string,PublicLinkedConfigurationSource>,depth=0):ProductSelectionV2|null {
  if(depth>12 || selection.productId!==configuration.productId)return null;
  const groups:GroupSelection[]=[];
  for(const prior of selection.groups) {
    const group=configuration.groups.find(x=>x.id===prior.groupId&&x.type===prior.type);if(!group||group.available===false)return null;
    if(group.type==="SIZE"&&prior.type==="SIZE") {
      if(!group.sizes.some(s=>s.id===prior.sizeChoiceId&&s.available!==false))return null;
      const child=rebaseSelectionRevisions({...selection,groups:prior.children??[]},{...configuration,groups:group.children??[]},sources,depth+1);
      if(!child)return null;groups.push({...prior,...(prior.children !== undefined || child.groups.length ? {children:child.groups} : {})});continue;
    }
    if(group.type!=="OPTIONS"||prior.type!=="OPTIONS")return null;
    const shared=rebaseSelectionRevisions({...selection,groups:prior.children??[]},{...configuration,groups:group.children??[]},sources,depth+1);
    if(!shared)return null;
    const instances:OptionSelectionInstance[]=[];
    for(const unit of prior.instances) {
      const option=group.options.find(o=>o.id===unit.optionId&&o.available!==false);if(!option)return null;
      const child=rebaseSelectionRevisions({...selection,groups:unit.children??[]},{...configuration,groups:option.children??[]},sources,depth+1);
      if(!child)return null;const linked=linkedConfiguration(option,sources);
      if(Boolean(linked)!==Boolean(unit.linkedSelection))return null;
      const next=linked&&unit.linkedSelection?rebaseSelectionRevisions(unit.linkedSelection,linked,sources,depth+1):undefined;
      if(linked&&!next)return null;instances.push({...unit,...(unit.children !== undefined || child.groups.length ? {children:child.groups} : {}),...(next?{linkedSelection:next}:{})});
    }
    groups.push({...prior,instances,...(prior.children !== undefined || shared.groups.length ? {children:shared.groups} : {})});
  }
  // No new choice, ID or branch is inferred by rebasing. The server validates this exact proposal.
  return {...selection,configurationRevision:configuration.revision,groups};
}
function buildGroups(groups:readonly ConfigurationGroup[],sources:ReadonlyMap<string,PublicLinkedConfigurationSource>,createId:InstanceIdFactory,
  budget={remaining:DEFAULT_ENGINE_LIMITS.maxSelectionInstances}):GroupSelection[] {
  const result:GroupSelection[]=[],scope=selectionScope(sources);
  for(const group of groups) {
    if(group.available===false)continue;
    if(group.type==="SIZE") {const size=group.sizes.find(s=>s.available!==false&&(group.children??[]).every(scope.possible));
      if(size)result.push({type:"SIZE",groupId:group.id,sizeChoiceId:size.id,children:buildGroups(group.children??[],sources,createId,budget)});continue;}
    const bounds=scope.analyze(group);if(bounds.state==="ZERO_VALID_SELECTIONS")continue;
    const instances:OptionSelectionInstance[]=[];
    // Fill only mathematically forced units; never guess among multiple required choices.
    for(const option of group.options)for(let i=0;i<(bounds.ranges.get(option.id)?.min??0)&&budget.remaining>0;i++)instances.push(buildOptionInstance(option,sources,createId,budget));
    if(instances.length)result.push({type:"OPTIONS",groupId:group.id,instances,children:buildGroups(group.children??[],sources,createId,budget)});
  }
  return result;
}
export function buildOptionInstance(option:OptionChoice,sources:ReadonlyMap<string,PublicLinkedConfigurationSource>,createId:InstanceIdFactory,
  budget={remaining:DEFAULT_ENGINE_LIMITS.maxSelectionInstances}):OptionSelectionInstance {
  budget.remaining--;const linked=linkedConfiguration(option,sources);
  return {instanceId:createId("selection"),optionId:option.id,children:buildGroups(option.children??[],sources,createId,budget),
    ...(linked?{linkedSelection:buildInitialSelection(linked,sources,createId,budget)}:{})};
}
export function buildInitialSelection(configuration:ProductConfigurationV2,sources:ReadonlyMap<string,PublicLinkedConfigurationSource>,createId:InstanceIdFactory,
  budget?:{remaining:number}):ProductSelectionV2 {
  const overDepth=!budget&&validateGroupLevelsV2(configuration,id=>sources.get(id)?.configuration).length>0;
  return {schemaVersion:2,productId:configuration.productId,configurationRevision:configuration.revision,
    groups:overDepth?[]:buildGroups(configuration.groups,sources,createId,budget)};
}
export function completeForcedSelection(config:ProductConfigurationV2,selection:ProductSelectionV2,
  sources:ReadonlyMap<string,PublicLinkedConfigurationSource>,createId:InstanceIdFactory,currency?:string):ProductSelectionV2 {
  const scope=selectionScope(sources),budget={remaining:DEFAULT_ENGINE_LIMITS.maxSelectionInstances};
  function reserve(groups:GroupSelection[]) { for(const group of groups){reserve(group.children??[]);if(group.type==="OPTIONS")for(const unit of group.instances){budget.remaining--;reserve(unit.children??[]);if(unit.linkedSelection)reserve(unit.linkedSelection.groups)}} }
  reserve(selection.groups);
  function complete(defs:readonly ConfigurationGroup[],saved:GroupSelection[]):GroupSelection[] {
    const result=[...saved];
    for(const group of defs) {
      if(group.available===false)continue;
      const index=result.findIndex(x=>x.groupId===group.id),prior=result[index];
      if(group.type==="SIZE") {
        if(prior&&prior.type!=="SIZE")continue;
        const size=prior?group.sizes.find(s=>s.id===prior.sizeChoiceId&&s.available!==false):group.sizes.find(s=>s.available!==false);
        if(!size)continue;const next:SizeGroupSelection={type:"SIZE",groupId:group.id,sizeChoiceId:size.id,children:complete(group.children??[],prior?.children??[])};
        if(index<0)result.push(next);else result[index]=next;continue;
      }
      if(prior&&prior.type!=="OPTIONS")continue;
      const bounds=scope.analyze(group);if(bounds.state==="ZERO_VALID_SELECTIONS")continue;
      const instances=(prior?.instances??[]).map(unit=>{const option=group.options.find(o=>o.id===unit.optionId);if(!option||!bounds.ranges.get(option.id)?.available)return unit;
        const linked=linkedConfiguration(option,sources);return {...unit,children:complete(option.children??[],unit.children??[]),
          ...(linked?{linkedSelection:unit.linkedSelection?{...unit.linkedSelection,groups:complete(linked.groups,unit.linkedSelection.groups)}:buildInitialSelection(linked,sources,createId,budget)}:{})};});
      for(const option of group.options)for(let n=instances.filter(u=>u.optionId===option.id).length;n<(bounds.ranges.get(option.id)?.min??0)&&budget.remaining>0;n++)instances.push(buildOptionInstance(option,sources,createId,budget));
      if(prior||instances.length){const next:OptionGroupSelection={type:"OPTIONS",groupId:group.id,instances,children:instances.length?complete(group.children??[],prior?.children??[]):[]};
        if(index<0)result.push(next);else result[index]=next;}
    }return result;
  }
  const completed={...selection,groups:complete(config.groups,selection.groups)};
  const contextCurrency=currency??sources.values().next().value?.currency;
  return contextCurrency?completeAnonymousSelectionV2(config,completed,publicConfigurationContext("public-envelope",[...sources.values()],contextCurrency)).selection:completed;
}
export function changeSizeSelection(selection:ProductSelectionV2,group:SizeGroup,targetId:string,_sources:ReadonlyMap<string,PublicLinkedConfigurationSource>,_createId:InstanceIdFactory):{selection:ProductSelectionV2;error?:never}|{error:string;selection?:never} {
  if(group.available===false||!group.sizes.some(s=>s.id===targetId&&s.available!==false))return {error:group.label};
  const prior=selection.groups.find((x):x is SizeGroupSelection=>x.groupId===group.id&&x.type==="SIZE");
  // V2 children belong to the group, so changing a size preserves every branch/instance ID.
  return {selection:replaceGroupSelection(selection,{type:"SIZE",groupId:group.id,sizeChoiceId:targetId,children:prior?.children??[]})};
}
export function replaceGroupSelection(selection:ProductSelectionV2,group:GroupSelection|null) {
  if(!group)return selection;return {...selection,groups:selection.groups.some(x=>x.groupId===group.groupId)?selection.groups.map(x=>x.groupId===group.groupId?group:x):[...selection.groups,group]};
}
export function updateOptionGroup(selection:ProductSelectionV2,groupId:string,instances:OptionSelectionInstance[],children?:GroupSelection[]) {
  const old=selection.groups.find((x):x is OptionGroupSelection=>x.type==="OPTIONS"&&x.groupId===groupId);
  const group:OptionGroupSelection={type:"OPTIONS",groupId,instances,children:children??old?.children??[]};
  return instances.length?replaceGroupSelection(selection,group):{...selection,groups:selection.groups.filter(x=>x.groupId!==groupId)};
}
export function canAddOptionInstance(input:{available:boolean;optionCount:number;optionMax:number;groupCount:number;groupMax:number;radioMode:boolean}) {
  return input.available&&input.optionCount<input.optionMax&&(input.radioMode||input.groupCount<input.groupMax);
}
export function calculatePublicPreview(envelope:PublicProductConfigurationResponse,restaurantSlug:string,selection:ProductSelectionV2):PriceResult {
  if(!envelope.orderable)return {valid:false,total:null,baseIgnored:false,lines:[],issues:envelope.issues.length?envelope.issues:[{code:"PRODUCT_UNORDERABLE",path:"$configuration",message:"Product is unavailable."}]};
  return calculatePriceV2(envelope.configuration,selection,publicConfigurationContext(restaurantSlug,envelope.linkedProducts,envelope.currency));
}
export function validatePublicSelection(envelope:PublicProductConfigurationResponse,restaurantSlug:string,selection:ProductSelectionV2) {
  return !envelope.orderable?envelope.issues:validateSelectionV2(envelope.configuration,selection,publicConfigurationContext(restaurantSlug,envelope.linkedProducts,envelope.currency));
}
