import { DEFAULT_ENGINE_LIMITS, resolveLinkedConfigurationV2, type ProductConfigurationV2,
  type ConfigurationGroupV2 as ConfigurationGroup, type OptionChoiceV2 as OptionChoice, type OptionGroupV2 as OptionGroup } from "@menu/shared";
import type { PublicLinkedConfigurationSource } from "@/lib/api";
type Sources = ReadonlyMap<string, PublicLinkedConfigurationSource>;
type Range = { min: number; max: number; available: boolean };
type Analysis = { state: "ZERO_VALID_SELECTIONS" | "ONE_VALID_SELECTION" | "MULTIPLE_VALID_SELECTIONS"; ranges: Map<string, Range> };
/** Display-only integer feasibility. Final validity and all money remain in Shared V2. */
export function analyzeOptionGroup(group: OptionGroup, available: (o: OptionChoice) => boolean): Analysis {
  const ranges = new Map<string, Range>(), cap = DEFAULT_ENGINE_LIMITS.maxQuantityPerGroup, maximum = group.max ?? cap;
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= cap;
  let lower=0, upper=0, impossible = !integer(group.min) || !integer(maximum) || group.min > maximum || !group.options.length;
  for (const option of group.options) {
    const enabled = group.available !== false && option.available !== false && available(option);
    const min = option.minQuantity ?? 0, declared = option.maxQuantity ?? maximum, max = enabled ? Math.min(declared, maximum) : 0;
    impossible ||= !integer(min) || !integer(declared) || (option.maxQuantity !== null && declared > maximum) || min > max || ranges.has(option.id);
    lower += min;upper += max;ranges.set(option.id,{min,max,available:enabled});
  }
  if (impossible || lower > maximum || upper < group.min) return {state:"ZERO_VALID_SELECTIONS",ranges};
  let multiple=false;
  for(const range of ranges.values()) { const min=Math.max(range.min,group.min-(upper-range.max));
    range.max=Math.min(range.max,maximum-(lower-range.min));range.min=min;multiple ||= min !== range.max; }
  return {state:multiple?"MULTIPLE_VALID_SELECTIONS":"ONE_VALID_SELECTION",ranges};
}
/** The envelope is already restaurant-scoped; this resolves parent-local ORIGINAL prices for display only. */
export function resolvedLinkedConfiguration(option: OptionChoice, sources: Sources): ProductConfigurationV2 | null {
  const source = option.linkedProduct && sources.get(option.linkedProduct.sourceProductId);
  if (!source || !option.linkedProduct) return null;
  const context = {catalogId:"public-envelope",currency:source.currency,linkedProducts:new Map([...sources.values()].map(x=>[x.productId,{
    productId:x.productId,catalogId:"public-envelope",configuration:x.configuration,available:x.available,orderable:x.orderable
  }]))};
  const result=resolveLinkedConfigurationV2(option.linkedProduct,context,"$display",[]);
  return result.issues.length ? null : result.resolved?.configuration ?? null;
}
export function selectionScope(sources: Sources) {
  const memo=new Map<ConfigurationGroup,boolean>();
  function possible(group: ConfigurationGroup): boolean {
    const known=memo.get(group);if(known!==undefined)return known;memo.set(group,false);
    const valid=group.type==="SIZE" ? group.available!==false && (group.children??[]).every(possible) && group.sizes.some(s=>s.available!==false)
      : analyzeOptionGroup(group,o=>(group.children??[]).every(possible)&&optionAvailable(o)).state!=="ZERO_VALID_SELECTIONS";
    memo.set(group,valid);return valid;
  }
  function optionAvailable(option: OptionChoice): boolean {
    if(option.available===false || !(option.children??[]).every(possible))return false;
    if(!option.linkedProduct)return true;
    const linked=resolvedLinkedConfiguration(option,sources);return !!linked && linked.groups.every(possible);
  }
  return {possible,optionAvailable,analyze:(group:OptionGroup)=>analyzeOptionGroup(group,o=>(group.children??[]).every(possible)&&optionAvailable(o))};
}
