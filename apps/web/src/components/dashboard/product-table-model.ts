import { validateConfigurationV2, configurationContainsSizeV2, type ProductConfigurationV2, type ProductEditorAggregate, type ProductEditorFields, type SaveProductEditor } from "@menu/shared";
import { ProductEditorSaveError } from "./product-editor-save";

export function isTableBaseConfiguration(configuration:ProductConfigurationV2|null):boolean {
 return !!configuration && configuration.basePrice!==null && !configurationContainsSizeV2(configuration.groups) && validateConfigurationV2(configuration).length===0;
}
/** Preserve V2 identity; change both financial Base copies through the existing CAS writer. */
export function productTableSave(current:ProductEditorAggregate,patch:Partial<ProductEditorFields>,baseEditable=true):SaveProductEditor {
 const input:SaveProductEditor={create:false,expectedProductVersion:current.editVersion,expectedConfigurationVersion:current.configurationVersion,product:{...current.product,...patch}};
 if(patch.basePrice!==undefined && current.configuration){
  if(!baseEditable||!isTableBaseConfiguration(current.configuration)||patch.basePrice===null)
   throw new ProductEditorSaveError("عدّل أسعار شبكة الخيارات من محرر الصنف؛ السعر الأساسي لا يمكن أن يكون فارغًا.",400);
  input.configuration={...current.configuration,basePrice:patch.basePrice,revision:current.configurationVersion+1};
 }
 return input;
}
/** Move within a complete category. Other and unloaded rows retain their relative order. */
export function moveProductBeforeOrAfter<T extends {id:string}>(rows:readonly T[],id:string,targetId:string,after:boolean):T[]{
 const source=rows.find(x=>x.id===id),target=rows.find(x=>x.id===targetId);
 if(!source||!target||id===targetId)throw new Error("Invalid category move");
 const result=rows.filter(x=>x.id!==id),index=result.findIndex(x=>x.id===targetId);
 result.splice(index+(after?1:0),0,source);return result;
}

/** V62 productLivePlacement: resolve equal centers in the upward direction. */
export function productRowBefore(center:number,rowCenter:number,direction:number):boolean {
 return center<rowCenter || direction<0 && Math.abs(center-rowCenter)<0.75;
}
