import {describe,it,expect} from "vitest";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {appendProductPage} from "./product-management";
import {configurationEditorIssues,safeProductSaveMessage} from "./product-configuration/configuration-editor-errors";
import {draftPreviewEnvelope,DraftConfiguratorPreview} from "./product-configuration/draft-configurator-preview";
import {demoPizza,demoCombo,demoDrink} from "./product-configuration/v62-fixtures";
import {buildInitialSelection,calculatePublicPreview} from "../public/product-configurator-model";
import { SelectionGroups } from "../public/product-configurator";
import { ProductEditorFields } from "./product-editor-fields";
import {validateConfigurationV2} from "@menu/shared";
describe('Product management and isolated draft preview',()=>{
 it('appends pages in stable server order without duplicate products',()=>{const a={id:'a'},b={id:'b'},c={id:'c'};const first=[a,b] as never[];expect(appendProductPage(first,[b,c] as never[])).toEqual([a,b,c]);expect(first).toEqual([a,b])});
 it.each(['EMPTY_OPTIONS_GROUP','EMPTY_SIZE_GROUP','REQUIRED_TEXT','INVALID_MONEY','GROUP_MIN_EXCEEDS_MAX','INVALID_SIZE_PRICING_SCOPE','LINK_TARGET_NOT_FOUND','LINK_CYCLE','GROUP_LEVEL_LIMIT','MEDIA_NOT_OWNED','PRODUCT_CONFIGURATION_PERMISSION_DENIED','PRODUCT_VERSION_CONFLICT'])('maps %s to actionable Arabic without internal paths',(code)=>{
  const rows=configurationEditorIssues(demoPizza(),[{code,path:'$configuration.groups[0]',message:'secret Exception INTERNAL'}]);expect(rows).toHaveLength(1);expect(rows[0].message).toMatch(/[\u0600-\u06ff]/);expect(rows[0].message).not.toMatch(/secret|Exception|configuration\./);expect(rows[0].ref?.id).toBe(demoPizza().groups[0].id);
 });
 it('deduplicates repeated issues without merging different nodes',()=>{const c=demoPizza(),a={code:'REQUIRED_TEXT',path:'$configuration.groups[0].sizes[0].label',message:'internal'};expect(configurationEditorIssues(c,[a,a])).toHaveLength(1);expect(configurationEditorIssues(c,[a,{...a,path:'$configuration.groups[0].sizes[1].label'}])).toHaveLength(2)});
 it.each([400,401,403,409,500])('never exposes a raw save exception for HTTP %s',status=>{expect(safeProductSaveMessage({status,message:'PrismaClientKnownRequestError configuration.groups[0]'})).not.toMatch(/Prisma|configuration\./)});
 it('uses existing Shared calculations and never mutates the configuration',()=>{const c=demoPizza(),before=JSON.stringify(c),envelope=draftPreviewEnvelope(c,'بيتزا','SYP',[],[]);let n=0;const selection=buildInitialSelection(c,new Map(),()=>String(++n));const result=calculatePublicPreview(envelope,'editor-preview',selection);expect(result).toHaveProperty('valid');expect(JSON.stringify(c)).toBe(before);expect(envelope.minimumPrice).toBeNull()});
 it('renders the same customer selection classes without order/cart/save actions',()=>{const c=demoPizza();const html=renderToStaticMarkup(React.createElement(DraftConfiguratorPreview,{configuration:c,name:'بيتزا',currency:'SYP',sources:[],issues:[]}));expect(html).toContain('data-draft-configurator-preview');expect(html).toContain('role="radio"');expect(html).not.toContain('إضافة إلى السلة');expect(html).not.toContain('WhatsApp');expect(html).not.toContain('حفظ الصنف')});
 it('does not invent a total for invalid size prices',()=>{const c=demoPizza();const g=c.groups[0];if(g.type==='SIZE')g.sizes[0].price='';const issues=validateConfigurationV2(c);const html=renderToStaticMarkup(React.createElement(DraftConfiguratorPreview,{configuration:c,name:'بيتزا',currency:'SYP',sources:[],issues}));expect(html).toContain('المسودة غير مكتملة');expect(html).not.toContain('ملخص السعر')});
 it('preserves ORIGINAL and CUSTOM source definitions in the draft envelope',()=>{const c=demoCombo(),drink=demoDrink(),before=JSON.stringify(c);const source={productId:drink.productId,slug:'drink',name:'مشروب',currency:'SYP',configurationRevision:drink.revision,mode:'NETWORK' as const,available:true,orderable:true,configuration:drink};const e=draftPreviewEnvelope(c,'وجبة','SYP',[source],[]);expect(e.configuration).toBe(c);expect(e.linkedProducts[0]).toBe(source);expect(JSON.stringify(c)).toBe(before)});
});

describe('Single customer renderer and trusted currency presentation',()=>{
 it.each(['pizza','drink','combo'])('uses identical customer option markup for %s',kind=>{
  const config=kind==='pizza'?demoPizza():kind==='drink'?demoDrink():demoCombo();const drink=demoDrink();
  const sources=kind==='combo'?[{productId:drink.productId,slug:'drink',name:'مشروب',currency:'SYP',configurationRevision:drink.revision,mode:'NETWORK' as const,available:true,orderable:true,configuration:drink}]:[];
  const map=new Map(sources.map(x=>[x.productId,x]));let seq=0;const createId=()=>`editor-preview-${++seq}`;
  const selection=buildInitialSelection(config,map,createId);
  const customer=renderToStaticMarkup(React.createElement(SelectionGroups,{configuration:config,selection,sources:map,currency:'SYP',locale:'ar',showPrices:true,createId,onChange(){},onSelectionProblem(){},ancestorHasFrame:false}));
  const draft=renderToStaticMarkup(React.createElement(DraftConfiguratorPreview,{configuration:config,name:'صنف',currency:'SYP',sources,issues:[]}));
  expect(draft).toContain(customer);if(kind==="combo")expect(customer).not.toContain("غير متاح");expect(draft).not.toContain('إضافة إلى السلة');
 });
 it.each([['SYP','ل.س'],['EUR','€'],['USD','$'],['AED','د.إ']])('uses immutable %s currency within the price frame', (currency,symbol)=>{
  const draft={configuration:null,configurationMode:'LEGACY',name:'صنف',description:'',categoryId:'',basePrice:'0',currency,imageUrl:'',imageUrls:[],imageReferences:[],moodKeys:[],ingredients:[],mealDetails:[],model3dUrl:'',model3dFormat:'GLB',vrUrl:'',isNew:false,isPopular:false,isFeatured:false};
  const html=renderToStaticMarkup(React.createElement(ProductEditorFields,{draft,patch(){},categories:[],moods:[],ingredients:[],details:[],ingredientStatus:'idle',detailStatus:'idle',disabled:false,sizesControlBase:false,uploading:false,baseReadOnly:false,uploadError:false,onUpload(){},onDismissUploadError(){}} as never));
  expect(html).toContain(`aria-label="عملة السعر">${symbol}</span>`);expect(html).not.toContain('عملة المنيو');expect(html).toContain('value="0"');
 });
});
