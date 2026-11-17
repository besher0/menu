import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculatePriceV2 as calculatePrice, validateGroupLevelsV2 as validateGroupLevels, type ConfigurationGroupV2 as ConfigurationGroup, type OptionGroupV2 as OptionGroup, type ProductConfigurationV2 } from "@menu/shared";
import type { PublicProductConfigurationResponse } from "@/lib/api";
import { buildInitialSelection, publicConfigurationContext } from "./product-configurator-model";
import { configurationSummary, SummaryRows } from "./configuration-summary-rows";
import { ConfigurationAmount } from "./configuration-amount";

function drinks(star = false, choiceStar = false): OptionGroup {
  return { id: "drinks", type: "OPTIONS", label: "Drinks", min: 1, max: 2, includedQuantity: 0, highlightInPriceSummary: star,
    options: [
      { id: "pepsi", label: "Pepsi", price: "3", maxQuantity: 2, minQuantity: 1, highlightInPriceSummary: choiceStar },
      { id: "cola", label: "Cola", price: "4", maxQuantity: 1, highlightInPriceSummary: true }
    ] };
}
function size(id: string): ConfigurationGroup {
  return { id, type: "SIZE", label: "Size "+id, sizes: [{ id: id+"s", label: "Small", price: "7" }] };
}
function config(productId: string, groups: ConfigurationGroup[]): ProductConfigurationV2 {
  return { productId, groups, basePrice: "0", schemaVersion: 2, revision: 1 };
}
function summarize(groups: ConfigurationGroup[], linked?: ProductConfigurationV2) {
  const tree = config("meal", groups);
  const sources: PublicProductConfigurationResponse["linkedProducts"] = linked ? [{
    productId: linked.productId, available: true, orderable: true, mode: "NETWORK", name: "Linked", slug: "linked", currency: "SYP", configurationRevision: linked.revision, configuration: linked
  }] : [];
  const dto: PublicProductConfigurationResponse = {
    productId: "meal", productName: "Meal", configuration: tree, configurationRevision: 1, linkedProducts: sources,
    productSlug: "meal", schemaVersion: 2, currency: "SYP", orderable: true,
    minimumPrice: null, maximumRequiredPrice: null, priceDisplay: "EXACT", issues: [],
    runtimeContext: { scope: "RESTAURANT", outletDifferentialApplied: false, serviceModeApplied: false, productScheduleApplied: false }
  };
  let id=0;
  const selection = buildInitialSelection(tree,new Map(sources.map(s=>[s.productId,s])),()=>String(++id));
  const quote = calculatePrice(tree,selection,publicConfigurationContext("lab", sources,"SYP"));
  expect(quote.issues).toEqual([]);
  const {root,mode} = configurationSummary(dto,selection,quote.lines,quote.total!);
  expect(mode).toBe("grouped");
  const fallback = configurationSummary(dto,{...selection,productId:"other"},quote.lines,quote.total!);
  expect(fallback.mode).toBe("original");
  expect(fallback.root.children.map(c=>c.label)).not.toContain("Drinks");
  function charged(r:typeof root):number {
    return r.charges.reduce((n,l)=>n+Number(l.chargedAmount),0)+r.children.reduce((n,c)=>n+charged(c),0);
  }
  function allLines(r: typeof root): typeof quote.lines {
    return [...r.charges, ...r.children.flatMap(allLines)];
  }
  for (const tree of [root, fallback.root]) {
    const displayed = allLines(tree);
    expect(displayed).toHaveLength(quote.lines.length);
    expect(new Set(displayed)).toEqual(new Set(quote.lines));
  }
  expect(charged(root)).toBe(Number(quote.total));
  expect(charged(fallback.root)).toBe(charged(root));
  return {root, quote, selection, dto};
}
it.each([[false,false],[true,false],[false,true],[true,true]])("renders group star %s and choice star %s independently", (groupStar,choiceStar)=>{
  const {root,quote}=summarize([drinks(groupStar,choiceStar)]);
  const group=root.children[0], option=groupStar?group.children[0]:group;
  if(groupStar) expect(group).toMatchObject({label:"Drinks",emphasized:true,charges:[]});
  expect(option).toMatchObject({label:"Pepsi",emphasized:choiceStar});
  expect(quote.total).toBe("3");
  expect(JSON.stringify(root)).not.toContain("Cola");
});

function flavour(max: number | null = 1, min = 1): OptionGroup {
  return { id:"flavour",type:"OPTIONS",label:"Flavour", min,max,includedQuantity:0,
    options:[{id:"lemon",label:"Lemon",price:"0",maxQuantity:1,minQuantity:min>0?1:0},{id:"berry",label:"Berry",price:"250",maxQuantity:1,minQuantity:min>1?1:0}] };
}
function beverage() {
  const group=drinks();group.options[0].price="1500";return group;
}
it.each(["CUSTOM","ORIGINAL","inline"] as const)("shows a linked or inline flavour subtotal once (%s)",mode=>{
  for(const berry of [false,true])for(const starred of [false,true]){
    const g=beverage(),f=flavour();f.highlightInPriceSummary=starred;
    f.options[0].minQuantity=berry?0:1;f.options[1].minQuantity=berry?1:0;
    const source=config("source",[f]);
    if(mode==="inline")g.options[0].children=[f];
    else g.options[0].linkedProduct={mode,sourceProductId:"source",...(mode==="CUSTOM"?{customConfiguration:source}:{originalPriceOverrides:{berry:{price:"250"}}})};
    const {root,quote}=summarize([g],mode==="inline"?undefined:source);
    const parent=root.children[0],child=starred?parent.children[0].children[0]:parent.children[0];
    expect(parent.charges).toEqual([]);
    expect(child.label).toBe(berry?"Berry":"Lemon");
    expect(child.charges.map(l=>[l.nodeId,l.chargedAmount])).toEqual([["pepsi","1500"],[berry?"berry":"lemon",berry?"250":"0"]]);
    expect(quote.total).toBe(berry?"1750":"1500");
  }
});
it.each([2,null])("keeps independent charge owners in multi-choice groups with max %s",max=>{
  for(const min of [1,2]){
    const g=beverage();g.options[0].children=[flavour(max,min)];
    const {root}=summarize([g]);expect(root.children[0].charges[0].chargedAmount).toBe("1500");
    expect(root.children[0].children.map(r=>r.charges.length)).toEqual(Array(min).fill(1));
  }
});
it("preserves the parent when no flavour is selected, or sibling branches exist",()=>{
  const g=beverage();g.options[0].children=[flavour(1,0)];
  expect(summarize([g]).root.children[0]).toMatchObject({charges:[{chargedAmount:"1500"}],children:[]});
  g.options[0].children=[flavour()];
  const other=flavour();other.id="ice";other.options=[{id:"ice-unit",label:"Ice",price:"12",maxQuantity:1}];
  g.options[0].linkedProduct={mode:"ORIGINAL",sourceProductId:"source",originalPriceOverrides:{"ice-unit":{price:"12"}}};
  for(const min of [0,1]){
    other.min=min;
    const {root,quote}=summarize([g],config("source",[other]));
    expect(root.children[0].charges.map(l=>l.chargedAmount)).toEqual(["1500"]);
    expect(quote.total).toBe(min?"1512":"1500");
  }
});
it.each(["ar", "en"] as const)("labels a standalone zero-priced flavour only on its choice row (%s)", locale => {
  const group = flavour();
  group.highlightInPriceSummary = true;
  group.options[0].minQuantity = 1;
  const { dto, selection, quote } = summarize([group]);
  const html = renderToStaticMarkup(createElement(SummaryRows, {
    envelope: dto, selection, lines: quote.lines, total: quote.total!, currency: "SYP", locale
  }));
  expect(html).toContain('>Lemon</span><small data-charge="0">' + (locale === "ar" ? "دون زيادة" : "No extra charge"));
  expect(html.match(/data-charge="0"/g)).toHaveLength(1);
});
it("uses charged amounts after exemptions and keeps repeated parent instances independent",()=>{
  const g=beverage();g.min=2;g.includedQuantity=1;g.options[0].minQuantity=2;
  const f=flavour();f.options[0].minQuantity=0;f.options[1].minQuantity=1;g.options[0].children=[f];
  const {root,quote}=summarize([g]);
  expect(root.children.map(p=>p.children[0].charges.reduce((s,l)=>s+Number(l.chargedAmount),0)).sort((a,b)=>a-b)).toEqual([250,1750]);
  for(const parent of root.children){
    const optionLine = quote.lines.find(line => line.path === parent.key)!;
    expect(parent.charges).toEqual(optionLine.chargedAmount === "0" ? [optionLine] : []);
    expect(parent.children[0].charges.every(l=>l.path.startsWith(parent.key))).toBe(true);
  }
  expect(quote.total).toBe("2000");
});
it("carries a size-adjusted parent price when one optional flavour was actually selected",()=>{
  const g=beverage(), f=flavour(1,0), s=size("meal-size");
  g.options[0].children=[f];g.options[0].priceBySize={sizeGroupId:"meal-size",overrides:{"meal-sizes":"1300"}};
  const {dto,selection}=summarize([s,g]);
  const branch=selection.groups.find(group=>group.type==="OPTIONS");
  if(branch?.type!=="OPTIONS")throw Error("Missing component");
  branch.instances[0].children=[{type:"OPTIONS",groupId:"flavour",instances:[{instanceId:"chosen-flavour",optionId:"berry"}]}];
  const quote=calculatePrice(dto.configuration,selection,publicConfigurationContext("lab",[],"SYP"));
  expect(quote.total).toBe("1557");
  const view=configurationSummary(dto,selection,quote.lines,quote.total!);
  expect(view.root.children[0].charges).toEqual([]);
  expect(view.root.children[0].children[0].charges.map(l=>l.chargedAmount)).toEqual(["1300","250"]);
  const fallback=configurationSummary(dto,{...selection,configurationRevision:-1},quote.lines,quote.total!);
  expect(fallback.mode).toBe("original");
  expect(fallback.root.children.find(r=>r.label==="Pepsi")?.charges[0].chargedAmount).toBe("1300");
  expect(fallback.root.children.find(r=>r.label==="Berry")?.charges[0].chargedAmount).toBe("250");
});
it("leaves an independent addition below the chosen flavour on its own row",()=>{
  const g=beverage(),f=flavour(), ice=flavour();
  ice.id="extras";ice.options=[{id:"ice",label:"Extra ice",price:"20",maxQuantity:1,minQuantity:1}];
  f.options[0].minQuantity=0;f.options[1].minQuantity=1;f.options[1].children=[{...ice,max:2}];
  g.options[0].children=[f];
  const {root,quote}=summarize([g]);const berry=root.children[0].children[0];
  expect(berry.charges.map(l=>l.chargedAmount)).toEqual(["1500","250"]);
  expect(berry.children[0].charges.map(l=>l.chargedAmount)).toEqual(["20"]);
  expect(quote.total).toBe("1770");
});
it.each(["ar","en"] as const)("labels actually waived choices once in grouped and fallback summaries (%s)",locale=>{
  const g=drinks(true);g.includedQuantity=1;
  const {dto,selection,quote}=summarize([g]);
  for(const productId of [dto.productId,"mismatch"]){
    const html=renderToStaticMarkup(createElement(SummaryRows,{envelope:dto,selection:{...selection,productId},lines:quote.lines,total:quote.total!,currency:"SYP",locale}));
    expect(html.match(/data-charge="0"/g)).toHaveLength(1);
    expect(html).toContain(locale==="ar"?"دون زيادة":"No extra charge");
    expect(html).not.toMatch(/Included|مشمولة/);expect(quote.total).toBe("0");
  }
});
it.each(["SYP","ل.س","EUR","USD","AED"])("preserves canonical formatting and isolates Arabic Syrian amounts (%s)",currency=>{
  for(const locale of ["ar","en"] as const){
    const html=renderToStaticMarkup(createElement(ConfigurationAmount,{value:"1500",currency,locale}));
    if(locale==="ar" && ["SYP","ل.س"].includes(currency))expect(html).toMatch(/dir="ltr">1500<\/bdi> <bdi dir="rtl">ل\.س</);
    else expect(html).toContain(["SYP","ل.س"].includes(currency) ? "1500 SYP" : "1500.00 "+currency);
  }
});
it("keeps a zero total numeric and does not label a zero base as an extra",()=>{
  const {dto,selection,quote}=summarize([]);
  expect(quote.total).toBe("0");
  const html=renderToStaticMarkup(createElement(SummaryRows,{envelope:dto,selection,lines:quote.lines,total:"0",currency:"SYP",locale:"ar"}));
  expect(html).not.toContain('data-charge="0"');
  const total=renderToStaticMarkup(createElement(ConfigurationAmount,{value:quote.total!,currency:"SYP",locale:"ar"}));
  expect(total).toContain('dir="ltr">0</bdi>');
});
it("preserves included, repeated and zero choices in separate positions",()=>{
  const group=drinks(false,true);group.min=2;group.includedQuantity=1;group.options[0].minQuantity=2;
  const {root}=summarize([group]);
  expect(root.children.map(r=>r.label)).toEqual(["Pepsi","Pepsi"]);
  expect(new Set(root.children.map(r=>r.key)).size).toBe(2);
  expect(root.children.map(r=>r.charges[0].chargedAmount).sort()).toEqual(["0","3"]);
  group.options[0].price="0";
  expect(summarize([group]).root.children).toHaveLength(2);
});
it("keeps hidden group names out and preserves the nesting under a size",()=>{
  const outer=size("direct"); if(outer.type!=="SIZE") throw Error();
  const group=drinks();group.hidePublicLabel=true;group.options[0].highlightInPriceSummary=true;
  outer.children=[group];
  expect(summarize([outer]).root).toMatchObject({label:"Meal — Small",children:[{label:"Pepsi",emphasized:true}]});
  group.hidePublicLabel=false;group.highlightInPriceSummary=true;
  expect(summarize([outer]).root.children[0]).toMatchObject({label:"Drinks",children:[{label:"Pepsi"}]});
});
it("keeps independent sizes distinguishable and respects a starred size group",()=>{
  const a=size("one"),b=size("two");a.highlightInPriceSummary=true;
  const {root}=summarize([a,b]);
  expect(root.label).toBe("Meal");
  expect(root.children.map(c=>[c.label,c.emphasized,c.children[0].label])).toEqual([["Size one",true,"Small"],["Size two",false,"Small"]]);
  expect(summarize([a]).root).toMatchObject({label:"Meal — Small",children:[]});
});
it.each(["CUSTOM","ORIGINAL"] as const)("preserves source identity, presentation and prices for %s",mode=>{
  const parent=drinks(false,false),source=config("pizza",[size("linked")]);
  parent.options[0].linkedProduct={mode,sourceProductId:"pizza",...(mode==="CUSTOM"?{customConfiguration:source}:{originalPriceOverrides:{linkeds:{price:"9"}}})};
  const {root,quote}=summarize([parent],source);
  expect(root.children[0]).toMatchObject({label:"Pepsi — Small",emphasized:false});
  expect(quote.total).toBe(mode==="CUSTOM"?"10":"12");
});
it.each(["CUSTOM","ORIGINAL"] as const)("counts levels across %s links and leaves historic data intact",mode=>{
  const top=drinks(), middle=size("middle"),third=drinks();if(middle.type!=="SIZE")throw Error();
  middle.children=[third];const source=config("pizza",[middle]);
  top.options[0].linkedProduct={mode,sourceProductId:"pizza",...(mode==="CUSTOM"?{customConfiguration:source}:{})};
  const tree=config("root",[top]);expect(validateGroupLevels(tree,()=>source)).toEqual([]);
  third.options[0].children=[size("four")];const snapshot=JSON.stringify(tree);
  expect(validateGroupLevels(tree,()=>source)[0]?.code).toBe("GROUP_LEVEL_LIMIT");
  expect(JSON.stringify(tree)).toBe(snapshot);
});
it("keeps two independent component sizes on their own branches",()=>{
  const group=drinks(true,true);group.min=2;
  group.options.forEach((o,i)=>{
    o.minQuantity=1;o.maxQuantity=1;
    const s=size("s"+i);if(s.type!=="SIZE")throw Error();
    s.sizes[0].label=i?"Large":"Small";o.children=[s];
  });
  const {root,quote}=summarize([group]);
  expect(root.children[0].children.map(r=>r.label)).toEqual(["Pepsi — Small","Cola — Large"]);
  expect(quote.total).toBe("21");
});
it("takes the selected size override from the priced line",()=>{
  const g=drinks(false,true),s=size("direct");
  g.options[0].priceBySize={sizeGroupId:"direct",overrides:{directs:"12"}};
  const {root,quote}=summarize([s,g]);
  expect(root.children[0].charges[0].chargedAmount).toBe("12");
  expect(quote.total).toBe("19");
});
it.each(["EUR","USD","AED"])("rejects sub-cent configured prices before displaying a final total in %s",currency=>{
  const g=drinks();g.options[0].price="0.005";const tree=config("meal",[g]);
  const selection=buildInitialSelection(tree,new Map(),()=>"unit");
  const quote=calculatePrice(tree,selection,publicConfigurationContext("lab",[],currency));
  expect(quote.valid).toBe(false);expect(quote.total).toBeNull();expect(quote.issues.some(i=>i.code==="CURRENCY_SCALE_EXCEEDED")).toBe(true);
});

it("renders the parent as a heading only when its charge belongs to the selected child", () => {
  const group = beverage();
  const selectedFlavour = flavour();
  selectedFlavour.options[0].minQuantity = 0; selectedFlavour.options[1].minQuantity = 1;
  group.options[0].children = [selectedFlavour];
  const { dto, selection, quote } = summarize([group]);
  const html = renderToStaticMarkup(createElement(SummaryRows, {
    envelope: dto, selection, lines: quote.lines, total: quote.total!, currency: "SYP", locale: "en"
  }));
  expect(html).toMatch(/data-summary-heading="" data-summary-title=""><span dir="auto">Pepsi<\/span><\/div>/);
  expect(html).toContain('>Berry</span><b data-charge="1750">');
  expect(quote.total).toBe("1750");
});

it("preserves all three summary stars and reconciles charges for a single visually framed branch", () => {
  const group = drinks(true, true);
  const nested = flavour();
  nested.highlightInPriceSummary = true;
  group.options[0].children = [nested];
  const { dto, selection, quote } = summarize([group]);
  const html = renderToStaticMarkup(createElement(SummaryRows, {
    envelope: dto, selection, lines: quote.lines, total: quote.total!, currency: "SYP", locale: "en"
  }));
  for (const label of ["Drinks", "Pepsi", "Flavour"]) expect(html).toContain('>' + label + '</strong>');
  expect(quote.total).toBe("3");
  expect(html.match(/data-charge="3"/g)).toHaveLength(1);
});

it.each([false,true])("joins only the root product size regardless of its summary star (%s)", star => {
  const s=size("pizza-size");if(s.type!=="SIZE")throw Error();
  s.label="حجم البيتزا";s.highlightInPriceSummary=star;
  s.sizes=[{id:"small",label:"صغير",price:"11000"},{id:"medium",label:"وسط",price:"15000"},{id:"large",label:"كبير",price:"21000"},{id:"zero",label:"حجم مجاني",price:"0"}];
  const {dto,selection}=summarize([s]);dto.productName="بيتزا الكسافا";
  for(const choice of s.sizes){
    selection.groups=[{type:"SIZE",groupId:s.id,sizeChoiceId:choice.id}];
    const quote=calculatePrice(dto.configuration,selection,publicConfigurationContext("lab",[],"SYP"));
    const before=JSON.stringify({selection,quote,dto});
    const view=configurationSummary(dto,selection,quote.lines,quote.total!);
    expect(view.mode).toBe("grouped");expect(view.root.label).toBe("بيتزا الكسافا — "+choice.label);
    expect(view.root.children).toEqual([]);expect(view.root.charges).toEqual(quote.lines);
    expect(quote.total).toBe(choice.price);
    for(const locale of ["ar","en"] as const){
      const html=renderToStaticMarkup(createElement(SummaryRows,{envelope:dto,selection,lines:quote.lines,total:quote.total!,currency:"SYP",locale}));
      expect(html).not.toContain("حجم البيتزا");expect(html.match(/data-charge=/g)).toHaveLength(1);
      expect(html).toContain("بيتزا الكسافا — "+choice.label);
    }
    expect(JSON.stringify({selection,quote,dto})).toBe(before);
  }
});
it("does not repeat an already suffixed product name or absorb shared/private child sizes",()=>{
  const s=size("root-size");s.highlightInPriceSummary=true;
  const {dto,selection,quote}=summarize([s]);dto.productName="Pizza بيتزا — Small";
  expect(configurationSummary(dto,selection,quote.lines,quote.total!).root.label).toBe(dto.productName);
  const group=drinks(true);group.children=[size("shared")];group.options[0].children=[size("private")];
  const nested=summarize([s,group]);
  expect(nested.root.label).toBe("Meal — Small");
  expect(nested.root.children[0].children[0].label).toBe("Pepsi — Small");
  expect(nested.quote.total).toBe("24");
});
it.each([0,1])("keeps root size, paid additions and included quantities financial lines unchanged (%s)",included=>{
  const s=size("root-size"),g=drinks(true);s.highlightInPriceSummary=true;g.includedQuantity=included;
  const {root,quote}=summarize([s,g]);
  expect(root.label).toBe("Meal — Small");expect(root.charges.map(l=>l.chargedAmount)).toEqual(["7"]);
  expect(quote.total).toBe(included?"7":"10");
});
it.each(["CUSTOM","ORIGINAL"] as const)("preserves established starred linked sizes under their owner (%s)",mode=>{
  const g=drinks(),s=size("linked");s.highlightInPriceSummary=true;
  const linked=config("pizza",[s]);g.options[0].linkedProduct={mode,sourceProductId:"pizza",...(mode==="CUSTOM"?{customConfiguration:linked}:{originalPriceOverrides:{linkeds:{price:"9"}}})};
  const {root}=summarize([g],linked);
  expect(root.label).toBe("Meal");expect(root.children[0].label).toBe("Pepsi");
  expect(root.children[0].children[0]).toMatchObject({label:"Size linked",emphasized:true,children:[{label:"Small"}]});
});
