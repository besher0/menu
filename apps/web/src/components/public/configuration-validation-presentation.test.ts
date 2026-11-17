import { describe,it,expect } from "vitest";
import { validateSelectionV2,calculatePriceV2 } from "@menu/shared";
import { orderingFixturesV2,orderingContextV2 } from "../../../../api/src/modules/public-menu/testing/ordering-v2.fixtures";
import { groupNeedsChoice,validationPresentation } from "./configuration-validation-presentation";
describe("Missing-choice presentation over Shared validation",()=>{
 it.each([1,2,5])("collapses %i actual missing groups to one summary state without changing validity",count=>{
  const {pizza}=orderingFixturesV2();pizza.groups=Array.from({length:count},(_,i)=>({type:"OPTIONS" as const,id:`extras-${i}`,label:`Extras ${i}`,min:1,max:2,includedQuantity:0,options:[{id:`a-${i}`,label:"A",price:"10",maxQuantity:null},{id:`b-${i}`,label:"B",price:"20",maxQuantity:null}]}));
  const selected={schemaVersion:2 as const,productId:pizza.productId,configurationRevision:1,groups:[]};
  const issues=validateSelectionV2(pizza,selected,orderingContextV2());const display=validationPresentation(issues);
  expect(display.missing).toHaveLength(count);expect(display.other).toEqual([]);expect(calculatePriceV2(pizza,selected,orderingContextV2()).total).toBeNull();
  for(const group of pizza.groups)expect(groupNeedsChoice(group,`$selection.groups.${group.id}`,issues)).toBe(true);
 });
 it("does not mistake unavailable, stale, price or missing linked data for ordinary incomplete choices",()=>{
  for(const code of ["OPTION_UNAVAILABLE","MISSING_PRICE_SOURCE","STALE_CONFIGURATION_REVISION","MISSING_LINKED_SELECTION","UNSATISFIABLE_CONFIGURATION"]){const issue={code,path:"p",message:code};expect(validationPresentation([issue,issue])).toEqual({missing:[],other:[issue]});}
 });
 it("targets only the exact private or linked instance, including IDs with punctuation",()=>{
  const {pizza}=orderingFixturesV2();const group=pizza.groups[1];const issue={code:"GROUP_MIN_NOT_MET",path:"$selection.groups.parent.instances[1].linkedSelection.groups.extras",message:"missing"};
  expect(groupNeedsChoice(group,issue.path,[issue])).toBe(true);
  expect(groupNeedsChoice(group,issue.path.replace("[1]","[0]"),[issue])).toBe(false);
  expect(groupNeedsChoice(group,"$selection.groups.parent",[issue])).toBe(false);
 });
 it("maps option-level minimum to its owning group without splitting IDs",()=>{
  const {pizza}=orderingFixturesV2();const group=pizza.groups[1];if(group.type!=="OPTIONS")throw Error();group.options[0].id="option.with.dots";
  expect(groupNeedsChoice(group,"scope.extras",[{code:"OPTION_MIN_NOT_MET",path:"scope.extras.option.with.dots",message:"missing"}])).toBe(true);
  expect(groupNeedsChoice(group,"scope.extras",[])).toBe(false);
 });
 it("optional empty groups and no-configuration products have no missing-choice notice",()=>{
  const {pizza}=orderingFixturesV2();pizza.groups=[];const selected={schemaVersion:2 as const,productId:pizza.productId,configurationRevision:1,groups:[]};
  expect(validationPresentation(validateSelectionV2(pizza,selected,orderingContextV2()))).toEqual({missing:[],other:[]});
  expect(calculatePriceV2(pizza,selected,orderingContextV2()).total).toBe("9000");
 });
});
