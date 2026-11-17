import { describe, expect, it } from "vitest";
import { calculatePriceV2, validateSelectionV2, type ProductConfigurationV2, type ProductSelectionV2, type OptionGroupV2,
  type OptionGroupSelectionV2, type OptionChoiceV2 } from "@menu/shared";
import type { PublicLinkedConfigurationSource, PublicProductConfigurationResponse } from "@/lib/api";
import { orderingFixturesV2 } from "../../../../api/src/modules/public-menu/testing/ordering-v2.fixtures";
import { buildInitialSelection, buildOptionInstance, canAddOptionInstance, calculatePublicPreview, changeSizeSelection,
  LatestQuoteGate, rebaseSelectionRevisions, updateOptionGroup, completeForcedSelection } from "./product-configurator-model";
let nextId=0;const ids=()=>"unit-"+(++nextId);
function sourceMap(){const {drink,custom}=orderingFixturesV2();return new Map<string,PublicLinkedConfigurationSource>([drink,custom].map(configuration=>[configuration.productId,{
  productId:configuration.productId,slug:configuration.productId,name:configuration.productId,currency:"SYP",configurationRevision:configuration.revision,
  mode:"NETWORK",available:true,orderable:true,configuration}]))}
function envelope(configuration:ProductConfigurationV2):PublicProductConfigurationResponse{return {schemaVersion:2,currency:"SYP",productId:configuration.productId,
  productSlug:configuration.productId,productName:"DEMO",configurationRevision:configuration.revision,configuration,linkedProducts:[...sourceMap().values()],orderable:true,
  minimumPrice:null,maximumRequiredPrice:null,priceDisplay:"EXACT",issues:[],runtimeContext:{scope:"RESTAURANT",outletDifferentialApplied:false,serviceModeApplied:false,productScheduleApplied:false}}}
function pizzaSelection(){const {pizza}=orderingFixturesV2(),sources=sourceMap();let selected=buildInitialSelection(pizza,sources,ids);
 const extras=pizza.groups[1] as OptionGroupV2,cheese=buildOptionInstance(extras.options[0],sources,ids);
 cheese.children=[{type:"OPTIONS",groupId:"cheese-finish",instances:[{instanceId:ids(),optionId:"garlic"}]}];
 selected=updateOptionGroup(selected,extras.id,[cheese,buildOptionInstance(extras.options[1],sources,ids)]);return {pizza,selected,sources,cheese};}
describe("V2 customer configurator state",()=>{
 it("allows replacing a full radio group without exceeding a multi-unit group",()=>{
  const input={available:true,optionCount:0,optionMax:1,groupCount:1,groupMax:1,radioMode:true};expect(canAddOptionInstance(input)).toBe(true);expect(canAddOptionInstance({...input,radioMode:false})).toBe(false);
 });
 it("discards older async Quote responses after selection or route changes",async()=>{
  const gate=new LatestQuoteGate(),applied:string[]=[];let old!:(x:string)=>void,newer!:(x:string)=>void;
  const first=new Promise<string>(r=>old=r),second=new Promise<string>(r=>newer=r);const a=gate.next();const work=first.then(x=>{if(gate.isCurrent(a))applied.push(x)});
  gate.invalidate();const b=gate.next();const latest=second.then(x=>{if(gate.isCurrent(b))applied.push(x)});newer("latest");old("old");await Promise.all([work,latest]);expect(applied).toEqual(["latest"]);
 });
 it("does not guess between multiple required options",()=>{
  const {pizza}=orderingFixturesV2(),selected=buildInitialSelection(pizza,sourceMap(),ids);expect(selected.groups.some(g=>g.groupId==="extras")).toBe(false);
  expect(calculatePublicPreview(envelope(pizza),"restaurant",selected).issues.some(i=>i.code==="GROUP_MIN_NOT_MET")).toBe(true);
 });
 it("preserves exact units, shared and private branches across all size prices",()=>{
  const {pizza,selected,sources}=pizzaSelection();const size=pizza.groups[0];if(size.type!=="SIZE")throw Error("fixture");let current=selected;
  const old=JSON.stringify(selected.groups.find(g=>g.groupId==="extras"));
  for(const [id,total] of [["pizza-medium","17000"],["pizza-large","21500"],["pizza-small","12500"]]){
   const result=changeSizeSelection(current,size,id,sources,ids);expect(result.error).toBeUndefined();current=result.selection!;
   expect(JSON.stringify(current.groups.find(g=>g.groupId==="extras"))).toBe(old);expect(calculatePublicPreview(envelope(pizza),"restaurant",current)).toMatchObject({valid:true,total,baseIgnored:true});
  }
 });
 it("keeps highest-priced parent picks free while charging the selected child's price",()=>{
  const {pizza,selected}=pizzaSelection(),result=calculatePublicPreview(envelope(pizza),"restaurant",selected);
  expect(result.total).toBe("12500");expect(result.lines.find(l=>l.nodeId==="mushroom")).toMatchObject({included:true,chargedAmount:"0"});expect(result.lines.find(l=>l.nodeId==="garlic")?.chargedAmount).toBe("500");
 });
 it("rejects a newly unavailable size without dropping valid selections",()=>{
  const {pizza,selected,sources}=pizzaSelection();const size=pizza.groups[0];if(size.type!=="SIZE")throw Error("fixture");size.sizes[1].available=false;
  const before=JSON.stringify(selected);expect(changeSizeSelection(selected,size,size.sizes[1].id,sources,ids).selection).toBeUndefined();expect(JSON.stringify(selected)).toBe(before);
 });
 it("recovers a removed size by an explicit choice and preserves the shared branch",()=>{
  const {pizza,selected,sources}=pizzaSelection();const size=pizza.groups[0];if(size.type!=="SIZE")throw Error("fixture");const prior=selected.groups[0];if(prior.type!=="SIZE")throw Error("fixture");
  prior.sizeChoiceId="removed";prior.children=[{type:"OPTIONS",groupId:"bake",instances:[{instanceId:ids(),optionId:"extra-bake"}]}];
  const result=changeSizeSelection(selected,size,"pizza-small",sources,ids);expect(result.selection?.groups[0]).toMatchObject({children:prior.children});expect(calculatePublicPreview(envelope(pizza),"r",result.selection!).total).toBe("12750");
 });
 it("rebases only revisions and refuses a removed or unavailable private choice",()=>{
  const {pizza,selected,sources}=pizzaSelection(),current=structuredClone(pizza);current.revision=2;
  const result=rebaseSelectionRevisions(selected,current,sources);expect(result?.configurationRevision).toBe(2);expect(result?.groups).toEqual(selected.groups);
  (current.groups[1] as OptionGroupV2).options[0].available=false;expect(rebaseSelectionRevisions(selected,current,sources)).toBeNull();
 });
 it("rebases ORIGINAL live revisions and keeps CUSTOM snapshot revisions independently",()=>{
  const {combo,drink}=orderingFixturesV2(),sources=sourceMap(),group=combo.groups[0] as OptionGroupV2;
  const original=buildOptionInstance(group.options[0],sources,ids),custom=buildOptionInstance(group.options[1],sources,ids);
  const selected=updateOptionGroup(buildInitialSelection(combo,sources,ids),group.id,[original,custom]);drink.revision=2;
  const changedSources=new Map(sources);changedSources.set(drink.productId,{...sources.get(drink.productId)!,configuration:drink,configurationRevision:2});
  const current={...combo,revision:2},rebased=rebaseSelectionRevisions(selected,current,changedSources)!;const values=(rebased.groups.find(g=>g.groupId===group.id) as OptionGroupSelectionV2).instances;
  expect(values.map(x=>x.instanceId)).toEqual([original.instanceId,custom.instanceId]);expect(values.map(x=>x.linkedSelection?.configurationRevision)).toEqual([2,1]);
 });
 it("uses local ORIGINAL overlays, never the standalone source selling price",()=>{
  const {combo}=orderingFixturesV2(),sources=sourceMap(),group=combo.groups[0] as OptionGroupV2;
  const selected=updateOptionGroup(buildInitialSelection(combo,sources,ids),group.id,[buildOptionInstance(group.options[0],sources,ids)]);
  expect(calculatePublicPreview(envelope(combo),"r",selected)).toMatchObject({valid:true,total:"4500"});
 });
 it("creates independent repeated CUSTOM selections and counts group children once",()=>{
  const {combo}=orderingFixturesV2(),sources=sourceMap(),group=combo.groups[0] as OptionGroupV2;
  const a=buildOptionInstance(group.options[1],sources,ids),b=buildOptionInstance(group.options[1],sources,ids);expect(a.instanceId).not.toBe(b.instanceId);expect(a.linkedSelection).not.toBe(b.linkedSelection);
  const shared=[{type:"OPTIONS" as const,groupId:"shared-gift",instances:[{instanceId:ids(),optionId:"gift"},{instanceId:ids(),optionId:"gift"}]}];
  const selected=updateOptionGroup(buildInitialSelection(combo,sources,ids),group.id,[a,b],shared);
  const result=calculatePublicPreview(envelope(combo),"r",selected);expect(result.total).toBe("2300");expect(result.lines.filter(l=>l.nodeId==="gift")).toHaveLength(2);
  const next=updateOptionGroup(selected,group.id,[a]);expect((next.groups.find(g=>g.groupId===group.id) as OptionGroupSelectionV2).children).toEqual(shared);
 });
 it("auto-selects the sole mandatory anonymous choice exactly once",()=>{
  const {combo}=orderingFixturesV2(),sources=sourceMap(),initial=buildInitialSelection(combo,sources,ids);
  const next=completeForcedSelection(combo,initial,sources,ids,"SYP");expect(next.groups.find(g=>g.groupId==="anonymous")).toMatchObject({instances:[{optionId:"wrap"}]});
  expect(completeForcedSelection(combo,next,sources,ids,"SYP")).toEqual(next);
 });
 it("allows nullable merchant maxima while retaining the technical bound",()=>{
  const option:OptionChoiceV2={id:"o",label:"o",price:"0",maxQuantity:null};const config:ProductConfigurationV2={schemaVersion:2,productId:"p",revision:1,basePrice:"100",groups:[{type:"OPTIONS",id:"g",label:"g",min:1,max:null,includedQuantity:0,options:[option]}]};
  const selected=buildInitialSelection(config,new Map(),ids);expect((selected.groups[0] as OptionGroupSelectionV2).instances).toHaveLength(1);
  expect(validateSelectionV2(config,selected,{catalogId:"c",currency:"SYP"})).toEqual([]);
  expect(canAddOptionInstance({available:true,optionCount:100,optionMax:100,groupCount:100,groupMax:100,radioMode:false})).toBe(false);
 });
 it("does not invent a price for an unavailable product or a null Base",()=>{
  const {pizza}=orderingFixturesV2(),response=envelope(pizza);response.orderable=false;response.issues=[{code:"PRODUCT_UNAVAILABLE",path:"$configuration",message:"Unavailable"}];
  expect(calculatePublicPreview(response,"r",buildInitialSelection(pizza,sourceMap(),ids))).toMatchObject({valid:false,total:null});
  const config:ProductConfigurationV2={schemaVersion:2,productId:"p",revision:1,basePrice:null,groups:[]};expect(calculatePriceV2(config,{schemaVersion:2,productId:"p",configurationRevision:1,groups:[]},{catalogId:"r",currency:"SYP"}).valid).toBe(false);
 });
});
