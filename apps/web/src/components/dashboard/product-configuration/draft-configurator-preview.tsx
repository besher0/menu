"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ABO_MALEK_THEME, productEditorFingerprint, validateConfigurationV2, type ConfigurationIssue, type ProductConfigurationV2, type ProductSelectionV2 } from "@menu/shared";
import { SelectionGroups } from "@/components/public/product-configurator";
import { SummaryRows } from "@/components/public/configuration-summary-rows";
import { ConfigurationAmount } from "@/components/public/configuration-amount";
import { buildInitialSelection, rebaseSelectionRevisions, completeForcedSelection, calculatePublicPreview } from "@/components/public/product-configurator-model";
import { cssVars } from "@/lib/api";
import type { PublicProductConfigurationResponse, PublicLinkedConfigurationSource } from "@/lib/api";
import { configurationEditorIssues } from "./configuration-editor-errors";
import styles from "@/components/public/product-configurator.module.css";

export function draftPreviewEnvelope(config:ProductConfigurationV2,name:string,currency:string,sources:PublicLinkedConfigurationSource[],issues:ConfigurationIssue[]):PublicProductConfigurationResponse{
 return {schemaVersion:2,productId:config.productId,productSlug:config.productId,productName:name,currency,configurationRevision:config.revision,configuration:config,linkedProducts:sources,orderable:!issues.length,minimumPrice:null,maximumRequiredPrice:null,priceDisplay:'UNAVAILABLE',issues,
 runtimeContext:{scope:'RESTAURANT',outletDifferentialApplied:false,serviceModeApplied:false,productScheduleApplied:false}};
}
/** Renderer and calculations are shared with the customer UI. No transport, cart,
 * checkout or persistence action exists in this component. */
export function DraftConfiguratorPreview({configuration,name,currency,sources,issues,themeStyle}:{configuration:ProductConfigurationV2|null;name:string;currency:string;sources:PublicLinkedConfigurationSource[];issues:ConfigurationIssue[];themeStyle?:CSSProperties}){
 const seq=useRef(0);const createId=()=>`editor-preview-${++seq.current}`;
 const sourceMap=useMemo(()=>new Map(sources.map(x=>[x.productId,x])),[sources]);
 // Invalid root branches are omitted from the interactive view only. The draft,
 // validators and save remain unchanged; invalid drafts never display a total.
 const renderConfig=useMemo(()=>{
  if(!configuration)return null;const structural=validateConfigurationV2(configuration);
  const groups=configuration.groups.filter((g,index)=>!structural.some(x=>x.path.startsWith(`$configuration.groups[${index}]`)));
  const next={...configuration,groups};
  return validateConfigurationV2(next).length?null:next;
 },[configuration]);
 const signature=productEditorFingerprint(renderConfig);const [state,setState]=useState<{signature:string;selection:ProductSelectionV2}|null>(null);
 const selection=useMemo(()=>{
  if(!renderConfig)return null;
  if(state?.signature===signature)return state.selection;
  try{return state?rebaseSelectionRevisions(state.selection,renderConfig,sourceMap)??buildInitialSelection(renderConfig,sourceMap,createId):buildInitialSelection(renderConfig,sourceMap,createId)}catch{return null}
 },[signature,renderConfig,sourceMap,state]);
 const [problem,setProblem]=useState('');useEffect(()=>setProblem(''),[signature]);
 const envelope=useMemo(()=>renderConfig?draftPreviewEnvelope(renderConfig,name,currency,sources,issues):null,[renderConfig,name,currency,sources,issues]);
 const price=useMemo(()=>{try{return envelope&&selection&&!issues.length?calculatePublicPreview(envelope,'editor-preview',selection):null}catch{return null}},[envelope,selection,issues]);
 return <section aria-label="معاينة الشبكة كما يراها الزبون" style={themeStyle??cssVars(ABO_MALEK_THEME)} data-draft-configurator-preview>
  <h3>معاينة الشبكة كما يراها الزبون</h3>
  <div className={styles.configurator} dir="rtl" data-testid="draft-product-configurator">
   <header className={styles.heading}><h2>تخصيص الصنف</h2></header>
   {renderConfig&&selection?<SelectionGroups ancestorHasFrame={false} configuration={renderConfig} selection={selection} sources={sourceMap} currency={currency} locale="ar" showPrices={true} createId={createId}
    onChange={next=>{setProblem('');setState({signature,selection:completeForcedSelection(renderConfig,next,sourceMap,createId,currency)})}} onSelectionProblem={()=>setProblem('راجع الاختيارات التابعة قبل تغيير الحجم.')} />:<p role="status">أكمل بيانات الشبكة لعرض خياراتها.</p>}
   {problem&&<p role="status">{problem}</p>}
   {issues.length>0&&<p role="status">المسودة غير مكتملة؛ لا يُعرض إجمالي قبل تصحيحها.</p>}
   {!issues.length&&envelope&&selection&&price?.valid&&price.total!==null?<aside className={styles.summary} aria-live="polite">
    <div className={styles.summaryTitle}><span>ملخص السعر</span></div>
    <SummaryRows envelope={envelope} selection={selection} lines={price.lines} total={price.total} currency={currency} locale="ar" />
    <div className={styles.total}><span>الإجمالي</span><strong><ConfigurationAmount value={price.total} currency={currency} locale="ar" /></strong></div>
    <small>معاينة محلية للمسودة؛ التسعير النهائي يتحقق عند الطلب.</small>
   </aside>:!issues.length&&price&&!price.valid?<p role="status">أكمل الاختيارات المطلوبة لعرض السعر.</p>:null}
  </div>
 </section>;
}
