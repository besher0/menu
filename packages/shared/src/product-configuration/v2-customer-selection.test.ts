import { describe, expect, it } from "vitest";
import { parseProductSelectionV2, createSelectionKeyV2, calculatePriceV2, type ProductConfigurationV2, type ProductSelectionV2 } from "./index";
const selection=():ProductSelectionV2=>({schemaVersion:2,productId:"p",configurationRevision:1,groups:[]});
describe("V2 customer selection wire boundary",()=>{
  it("parses group-shared, per-instance and linked scopes without conflating them",()=>{
    const input={...selection(),groups:[{type:"OPTIONS",groupId:"g",children:[{type:"SIZE",groupId:"shared",sizeChoiceId:"s"}],instances:[
      {instanceId:"u",optionId:"o",children:[{type:"SIZE",groupId:"private",sizeChoiceId:"m"}],linkedSelection:{...selection(),productId:"linked"}}]}]};
    const parsed=parseProductSelectionV2(input);expect(parsed.issues).toEqual([]);expect(parsed.selection?.groups[0]).toMatchObject(input.groups[0]);
  });
  it.each(["price","currency","tenantId","snapshot","trustedTotal"])("rejects client authority in %s",key=>{
    expect(parseProductSelectionV2({...selection(),[key]:"forged"}).selection).toBeUndefined();
  });
  it("refuses schema1, wrong scalar types and unknown fields in shared branches",()=>{
    expect(parseProductSelectionV2({...selection(),schemaVersion:1}).issues[0].code).toBe("UNSUPPORTED_SELECTION_VERSION");
    expect(parseProductSelectionV2({...selection(),configurationRevision:"1"}).selection).toBeUndefined();
    expect(parseProductSelectionV2({...selection(),groups:[{type:"OPTIONS",groupId:"g",instances:[],children:[{type:"SIZE",groupId:"s",sizeChoiceId:"x",price:"0"}]}]}).selection).toBeUndefined();
  });
  it("retains valid long node IDs while bounding malformed depth and breadth",()=>{
    const id="x".repeat(500);expect(parseProductSelectionV2({...selection(),groups:[{type:"SIZE",groupId:id,sizeChoiceId:id}]}).issues).toEqual([]);
    let deep:unknown={type:"OPTIONS",groupId:"g",instances:[]};for(let i=0;i<100;i++)deep={type:"SIZE",groupId:"s"+i,sizeChoiceId:"x",children:[deep]};
    expect(parseProductSelectionV2({...selection(),groups:[deep]}).selection).toBeUndefined();
    expect(parseProductSelectionV2({...selection(),groups:Array.from({length:501},(_,i)=>({type:"OPTIONS",groupId:"g"+i,instances:[]}))}).selection).toBeUndefined();
  });
  it("gives omitted and empty optional groups one semantic cart identity",()=>{
    const config:ProductConfigurationV2={schemaVersion:2,productId:"p",revision:1,basePrice:"100",groups:[{type:"OPTIONS",id:"optional",label:"Optional",min:0,max:1,includedQuantity:0,options:[{id:"o",label:"o",price:"0",maxQuantity:1}]}]};
    const empty:ProductSelectionV2={...selection(),groups:[{type:"OPTIONS",groupId:"optional",instances:[]}]};
    expect(calculatePriceV2(config,selection(),{catalogId:"c",currency:"SYP"}).total).toBe("100");
    expect(calculatePriceV2(config,empty,{catalogId:"c",currency:"SYP"}).total).toBe("100");
    expect(createSelectionKeyV2(empty)).toBe(createSelectionKeyV2(selection()));
  });
});
