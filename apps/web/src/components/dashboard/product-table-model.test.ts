import {describe,it,expect} from "vitest";
import {productTableSave,moveProductBeforeOrAfter,isTableBaseConfiguration,productRowBefore} from "./product-table-model";
import {demoAggregate,demoPizza,demoCombo} from "./product-configuration/v62-fixtures";
import {calculatePriceV2,calculateMinimumPriceV2,type ProductConfigurationV2} from "@menu/shared";
const base=(groups:ProductConfigurationV2["groups"]=[]):ProductConfigurationV2=>({schemaVersion:2,productId:"base",revision:3,basePrice:"100",groups});
const extras:ProductConfigurationV2["groups"]=[{type:"OPTIONS",id:"extra",label:"إضافات",min:0,max:null,includedQuantity:1,options:[{id:"cheese",label:"جبنة",price:"25",maxQuantity:null}]}];
describe("Table Base editing preserves Network identity and existing pricing engine",()=>{
 it.each([["empty",[]],["optional",extras],["required",[{...extras[0],min:1}]]])("allows %s groups without resolved sizes",(_,groups)=>{
  const configuration=base(groups as ProductConfigurationV2["groups"]),current=demoAggregate(configuration),before=structuredClone(current);
  const input=productTableSave(current,{basePrice:"200"},true);
  expect(input.product.basePrice).toBe("200");expect(input.configuration?.basePrice).toBe("200");
  expect(input.configuration?.revision).toBe(4);expect(input.expectedConfigurationVersion).toBe(3);
  expect(input.configuration?.groups).toEqual(groups);expect(current).toEqual(before);
  expect(calculateMinimumPriceV2(input.configuration!,{catalogId:"qa",currency:"SYP"}).minimum).toBe("200");
 });
 it.each(["0","99999"])("preserves intentional Base %s",price=>{const input=productTableSave(demoAggregate(base(extras)),{basePrice:price});expect(input.configuration?.basePrice).toBe(price)});
 it("charges Base once and preserves Included Quantity for repeated optional extras",()=>{
  const updated=productTableSave(demoAggregate(base(extras)),{basePrice:"200"}).configuration!;
  const result=calculatePriceV2(updated,{schemaVersion:2,productId:"base",configurationRevision:4,groups:[{type:"OPTIONS",groupId:"extra",instances:[{instanceId:"a",optionId:"cheese"},{instanceId:"b",optionId:"cheese"}]}]},{catalogId:"qa",currency:"SYP"});
  expect(result.valid).toBe(true);expect(result.baseIgnored).toBe(false);expect(result.total).toBe("225");
  expect(result.lines.filter(x=>x.kind==="BASE")).toHaveLength(1);expect(result.lines.filter(x=>x.included)).toHaveLength(1);
 });
 it("keeps metadata edits configuration-free",()=>{const c=demoAggregate(demoPizza());expect(productTableSave(c,{name:"Renamed"},false).configuration).toBeUndefined()});
 it("keeps Legacy Base edits Legacy",()=>{const c=demoAggregate(base());c.configuration=null;c.configurationVersion=0;expect(productTableSave(c,{basePrice:"120"}).configuration).toBeUndefined()});
 it.each([demoPizza(),demoCombo()])("rejects inline and CUSTOM size-controlled Base",config=>{expect(isTableBaseConfiguration(config)).toBe(false);expect(()=>productTableSave(demoAggregate(config),{basePrice:"200"},true)).toThrow()});
 it("honors the server's ORIGINAL resolved size decision",()=>{expect(()=>productTableSave(demoAggregate(base(extras)),{basePrice:"200"},false)).toThrow()});
 it("does not convert blank Network Base into zero",()=>{expect(()=>productTableSave(demoAggregate(base()),{basePrice:null})).toThrow()});
 it("rejects invalid groups instead of silently dropping them",()=>{const c=base([{...extras[0],options:[]} as never]);expect(()=>productTableSave(demoAggregate(c),{basePrice:"200"})).toThrow()});
});
describe("Complete-category movement preserves unloaded siblings",()=>{
 const rows=["a","b","unseen1","unseen2"].map(id=>({id}));
 it("moves after a loaded row and preserves the hidden tail",()=>{expect(moveProductBeforeOrAfter(rows,"a","b",true).map(x=>x.id)).toEqual(["b","a","unseen1","unseen2"]);expect(rows[0].id).toBe("a")});
 it("moves before a loaded row",()=>expect(moveProductBeforeOrAfter(rows,"b","a",false).map(x=>x.id)).toEqual(["b","a","unseen1","unseen2"]));
 it.each([["missing","a"],["a","missing"],["a","a"]])("rejects invalid moves %s/%s",(a,b)=>expect(()=>moveProductBeforeOrAfter(rows,a,b,true)).toThrow());
});

describe("V62 upward row-placement boundary",()=>{
 it.each([[100,100,-1,true],[100.5,100,-1,true],[100,100,1,false],[99,100,0,true],[101,100,-1,false]])("center %s / row %s direction %s",(center,row,direction,expected)=>expect(productRowBefore(center as number,row as number,direction as number)).toBe(expected));
});
