"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronDown,
  ChevronLeft,
  CirclePlus,
  Link2,
  PackagePlus,
  Plus,
  Trash2
} from "lucide-react";
import type {
  ConfigurationGroup,
  OptionChoice,
  ProductConfigurationV1,
  SizeChoice
} from "@menu/shared";
import {
  appendChildGroup,
  appendChoice,
  appendRootGroup,
  collectPriceNodes,
  collectSizeChoices,
  countDescendants,
  EditableNode,
  findNode,
  moveNode,
  removeNode,
  updateNode
} from "./editor-model";
import type { EditorNodeRef, ProductCandidate, ProductConfigurationEnvelope } from "./types";
import { searchRestaurantProducts } from "./api";

type WorkspaceProps = {
  configuration: ProductConfigurationV1;
  onChange: (configuration: ProductConfigurationV1) => void;
  currentProductId: string;
  candidates: ProductCandidate[];
  sourceConfigurations: ReadonlyMap<string, ProductConfigurationEnvelope>;
  ensureSource: (productId: string) => Promise<ProductConfigurationEnvelope>;
  readOnly?: boolean;
  compact?: boolean;
};

type TreeProps = Pick<WorkspaceProps, "configuration" | "onChange" | "readOnly"> & {
  selectedId: string | null;
  onSelect: (ref: EditorNodeRef) => void;
};

function nodeHasData(node: EditableNode) {
  if ("type" in node) return (node.type === "SIZE" ? node.sizes.length : node.options.length) > 0;
  return countDescendants(node) > 0 || Boolean(node.label.trim());
}

function TreeActions({
  refValue,
  node,
  onMove,
  onDelete,
  readOnly
}: {
  refValue: EditorNodeRef;
  node: EditableNode;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  if (readOnly) return null;
  return (
    <span className="pc-tree-actions">
      <button type="button" title="تحريك لأعلى" aria-label="تحريك لأعلى" onClick={(event) => { event.stopPropagation(); onMove(-1); }}><ArrowUp size={14} /></button>
      <button type="button" title="تحريك لأسفل" aria-label="تحريك لأسفل" onClick={(event) => { event.stopPropagation(); onMove(1); }}><ArrowDown size={14} /></button>
      <button
        type="button"
        className="danger"
        title="حذف"
        aria-label={`حذف ${refValue.kind}`}
        onClick={(event) => {
          event.stopPropagation();
          const confirmed = !nodeHasData(node) || window.confirm("يحتوي هذا العنصر على بيانات أو عناصر متداخلة. هل تريد حذفه؟");
          if (confirmed) onDelete();
        }}
      ><Trash2 size={14} /></button>
    </span>
  );
}

function ConfigurationBranches({
  groups,
  level,
  selectedId,
  onSelect,
  configuration,
  onChange,
  readOnly
}: TreeProps & { groups: ConfigurationGroup[]; level: number }) {
  return (
    <div className="pc-tree-branches" style={{ "--pc-depth": level } as React.CSSProperties}>
      {groups.map((group) => {
        const groupRef: EditorNodeRef = { kind: "group", id: group.id };
        const choices = group.type === "SIZE" ? group.sizes : group.options;
        return (
          <article className={`pc-tree-group ${selectedId === group.id ? "selected" : ""}`} key={group.id}>
            <div className="pc-tree-node pc-tree-group-node">
              <button type="button" className="pc-tree-select" onClick={() => onSelect(groupRef)}>
                <span className={`pc-tree-type ${group.type.toLocaleLowerCase()}`}>{group.type === "SIZE" ? "أحجام" : "خيارات"}</span>
                <b>{group.label || "بلا اسم"}</b>
                <small>{choices.length} عناصر</small>
              </button>
              <TreeActions
                refValue={groupRef}
                node={group}
                readOnly={readOnly}
                onMove={(direction) => onChange(moveNode(configuration, groupRef, direction))}
                onDelete={() => onChange(removeNode(configuration, groupRef))}
              />
            </div>
            <div className="pc-tree-choices">
              {choices.map((choice) => {
                const kind = group.type === "SIZE" ? "size" : "option";
                const choiceRef: EditorNodeRef = { kind, id: choice.id };
                return (
                  <div className="pc-tree-choice-wrap" key={choice.id}>
                    <div className={`pc-tree-node pc-tree-choice ${selectedId === choice.id ? "selected" : ""}`}>
                      <button type="button" className="pc-tree-select" onClick={() => onSelect(choiceRef)}>
                        {choice.children?.length ? <ChevronDown size={15} /> : <ChevronLeft size={15} />}
                        <span>{choice.label || "بلا اسم"}</span>
                        <small>{choice.price}</small>
                        {"linkedProduct" in choice && choice.linkedProduct ? <Link2 size={14} aria-label="صنف مرتبط" /> : null}
                      </button>
                      <TreeActions
                        refValue={choiceRef}
                        node={choice}
                        readOnly={readOnly}
                        onMove={(direction) => onChange(moveNode(configuration, choiceRef, direction))}
                        onDelete={() => onChange(removeNode(configuration, choiceRef))}
                      />
                    </div>
                    {choice.children?.length ? (
                      <ConfigurationBranches
                        groups={choice.children}
                        level={level + 1}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        configuration={configuration}
                        onChange={onChange}
                        readOnly={readOnly}
                      />
                    ) : null}
                  </div>
                );
              })}
              {!readOnly ? (
                <button type="button" className="pc-tree-add-choice" onClick={() => onChange(appendChoice(configuration, group.id))}>
                  <Plus size={14} /> {group.type === "SIZE" ? "إضافة حجم" : "إضافة خيار"}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ConfigurationTreePanel(props: TreeProps) {
  return (
    <section className="pc-tree-panel" aria-label="شجرة تكوين الصنف">
      <header>
        <div><Boxes size={19} /><b>بنية الشبكة</b></div>
        {!props.readOnly ? (
          <span>
            <button type="button" onClick={() => props.onChange(appendRootGroup(props.configuration, "SIZE"))}><CirclePlus size={15} /> أحجام</button>
            <button type="button" onClick={() => props.onChange(appendRootGroup(props.configuration, "OPTIONS"))}><CirclePlus size={15} /> خيارات</button>
          </span>
        ) : null}
      </header>
      {props.configuration.groups.length ? (
        <ConfigurationBranches {...props} groups={props.configuration.groups} level={0} />
      ) : (
        <div className="pc-empty-tree"><PackagePlus size={28} /><b>ابدأ بإضافة مجموعة أحجام أو خيارات</b><small>يمكنك إنشاء أكثر من مجموعة أحجام مستقلة.</small></div>
      )}
    </section>
  );
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <label className="pc-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function numberValue(value: string, fallback = 0) {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function SourceTree({ configuration }: { configuration: ProductConfigurationV1 }) {
  function renderGroups(groups: ConfigurationGroup[], depth = 0): React.ReactNode {
    return groups.map((group) => (
      <div className="pc-source-node" key={group.id} style={{ marginInlineStart: depth * 14 }}>
        <b>{group.type === "SIZE" ? "أحجام" : "خيارات"}: {group.label}</b>
        {(group.type === "SIZE" ? group.sizes : group.options).map((choice) => (
          <div key={choice.id}>
            <span>{choice.label}</span><small>{choice.price}</small>
            {choice.children?.length ? renderGroups(choice.children, depth + 1) : null}
          </div>
        ))}
      </div>
    ));
  }
  return <div className="pc-source-tree">{configuration.groups.length ? renderGroups(configuration.groups) : <small>المصدر لا يحتوي على مجموعات.</small>}</div>;
}

function LinkedProductEditor({
  option,
  onOptionChange,
  configuration,
  currentProductId,
  candidates,
  sourceConfigurations,
  ensureSource,
  readOnly
}: WorkspaceProps & { option: OptionChoice; onOptionChange: (option: OptionChoice) => void }) {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductCandidate[]>(candidates);
  const [message, setMessage] = useState("");
  const linked = option.linkedProduct;
  const source = linked ? sourceConfigurations.get(linked.sourceProductId) : undefined;
  const filtered = (search.trim() ? searchResults : candidates).filter((candidate) => candidate.id !== currentProductId).slice(0, 30);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(candidates);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      void searchRestaurantProducts(search).then((products) => {
        if (!cancelled) setSearchResults(products);
      }).catch(() => {
        if (!cancelled) setMessage("تعذر البحث عن الأصناف حاليًا.");
      }).finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, candidates]);

  useEffect(() => {
    if (linked?.sourceProductId && !source) void ensureSource(linked.sourceProductId).catch(() => undefined);
  }, [linked?.sourceProductId, source, ensureSource]);

  async function selectSource(sourceProductId: string) {
    setLoading(true);
    setMessage("");
    try {
      const envelope = await ensureSource(sourceProductId);
      onOptionChange({
        ...option,
        linkedProduct: envelope.mode === "NETWORK"
          ? { sourceProductId, mode: "ORIGINAL", originalPriceOverrides: {} }
          : { sourceProductId, mode: "CUSTOM" }
      });
      if (envelope.mode === "LEGACY") setMessage("هذا مصدر Legacy. أنشئ لقطة CUSTOM صريحة قبل الحفظ؛ ORIGINAL غير مسموح.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الصنف المرتبط.");
    } finally {
      setLoading(false);
    }
  }

  function createSnapshot() {
    if (!linked || !source) return;
    const snapshot = source.configurationTree
      ? JSON.parse(JSON.stringify(source.configurationTree)) as ProductConfigurationV1
      : { schemaVersion: 1 as const, productId: source.productId, revision: source.configurationVersion, basePrice: source.basePrice, groups: [] };
    onOptionChange({ ...option, linkedProduct: { sourceProductId: linked.sourceProductId, mode: "CUSTOM", customConfiguration: snapshot } });
    setMessage("تم إنشاء لقطة CUSTOM صريحة داخل هذا السياق. عدّلها أدناه حسب الحاجة.");
  }

  const priceNodes = source?.configurationTree ? collectPriceNodes(source.configurationTree) : [];

  return (
    <section className="pc-linked-editor">
      <header><Link2 size={17} /><b>Linked Product / Combo</b></header>
      {!linked ? (
        <div className="pc-linked-picker">
          <input value={search} disabled={readOnly} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث في أصناف المطعم الحالي..." />
          {searchLoading ? <small>جارٍ البحث...</small> : null}
          <div>{filtered.map((candidate) => (
            <button type="button" disabled={readOnly || loading || !candidate.isAvailable} key={candidate.id} onClick={() => void selectSource(candidate.id)}>
              <span>{candidate.name}</span><small>{!candidate.isAvailable ? "غير متاح — غير قابل للربط" : candidate.configurationMode === "NETWORK" ? "Network" : "Legacy — CUSTOM فقط"}</small>
            </button>
          ))}</div>
        </div>
      ) : (
        <div className="pc-linked-settings">
          <div className="pc-linked-summary">
            <b>{candidates.find((candidate) => candidate.id === linked.sourceProductId)?.name ?? linked.sourceProductId}</b>
            {!readOnly ? <button type="button" className="danger-link" onClick={() => onOptionChange({ ...option, linkedProduct: undefined })}>إزالة الرابط</button> : null}
          </div>
          <div className="pc-segmented">
            <button
              type="button"
              className={linked.mode === "ORIGINAL" ? "active" : ""}
              disabled={readOnly || source?.mode !== "NETWORK"}
              onClick={() => onOptionChange({ ...option, linkedProduct: { sourceProductId: linked.sourceProductId, mode: "ORIGINAL", originalPriceOverrides: {} } })}
            >ORIGINAL</button>
            <button
              type="button"
              className={linked.mode === "CUSTOM" ? "active" : ""}
              disabled={readOnly}
              onClick={() => onOptionChange({ ...option, linkedProduct: { sourceProductId: linked.sourceProductId, mode: "CUSTOM", customConfiguration: linked.customConfiguration } })}
            >CUSTOM</button>
          </div>
          {source?.mode === "LEGACY" ? <p className="pc-inline-warning">مصدر Legacy: لا يمكن استخدام ORIGINAL، ولا يحدث أي تحويل تلقائي.</p> : null}
          {linked.mode === "ORIGINAL" ? (
            <>
              <div className="pc-source-preview"><b>بنية المصدر الحية</b>{source?.configurationTree ? <SourceTree configuration={source.configurationTree} /> : <small>جارٍ تحميل بنية المصدر...</small>}</div>
              <div className="pc-overrides">
                <b>أسعار السياق الأب (لا تُورث أسعار المصدر المستقل)</b>
                {priceNodes.map((node) => (
                  <label key={node.id}><span>{node.label}<small>{node.kind}</small></span><input
                    inputMode="decimal"
                    disabled={readOnly}
                    value={linked.originalPriceOverrides?.[node.id] ?? ""}
                    placeholder="0"
                    onChange={(event) => {
                      const originalPriceOverrides = { ...(linked.originalPriceOverrides ?? {}) };
                      if (event.target.value === "") delete originalPriceOverrides[node.id];
                      else originalPriceOverrides[node.id] = event.target.value;
                      onOptionChange({ ...option, linkedProduct: { ...linked, mode: "ORIGINAL", originalPriceOverrides } });
                    }}
                  /></label>
                ))}
              </div>
            </>
          ) : (
            <div className="pc-custom-snapshot">
              {!linked.customConfiguration ? (
                <div className="pc-snapshot-required">
                  <p>يلزم إنشاء لقطة صريحة. لن يحوّل النظام منتج Legacy تلقائيًا.</p>
                  <button type="button" disabled={readOnly || !source} onClick={createSnapshot}>إنشاء لقطة CUSTOM صريحة</button>
                </div>
              ) : (
                <>
                  <div className="pc-snapshot-head"><b>محرر اللقطة المخصصة</b>{!readOnly ? <button type="button" onClick={createSnapshot}>إعادة اللقطة من المصدر</button> : null}</div>
                  <ConfigurationWorkspace
                    configuration={linked.customConfiguration}
                    onChange={(customConfiguration) => onOptionChange({ ...option, linkedProduct: { ...linked, mode: "CUSTOM", customConfiguration } })}
                    currentProductId={linked.customConfiguration.productId}
                    candidates={candidates}
                    sourceConfigurations={sourceConfigurations}
                    ensureSource={ensureSource}
                    readOnly={readOnly}
                    compact
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
      {message ? <p className="pc-inline-note">{message}</p> : null}
    </section>
  );
}

function NodeInspector(props: WorkspaceProps & { selected: { node: EditableNode; ref: EditorNodeRef } | null }) {
  const { selected, configuration, onChange, readOnly } = props;
  if (!selected) return <aside className="pc-inspector pc-empty-inspector"><PackagePlus size={30} /><b>اختر عنصرًا من الشجرة لتعديله</b></aside>;
  const { node, ref } = selected;
  const apply = (next: EditableNode) => onChange(updateNode(configuration, ref.id, () => next));

  if (ref.kind === "group") {
    const group = node as ConfigurationGroup;
    return (
      <aside className="pc-inspector">
        <header><span>{group.type === "SIZE" ? "مجموعة أحجام" : "مجموعة خيارات"}</span><code>{group.id}</code></header>
        <label><span>اسم المجموعة</span><input disabled={readOnly} value={group.label} onChange={(event) => apply({ ...group, label: event.target.value })} /></label>
        <Toggle disabled={readOnly} checked={group.available !== false} label="المجموعة متاحة" onChange={(available) => apply({ ...group, available })} />
        {group.type === "OPTIONS" ? (
          <div className="pc-field-grid">
            <label><span>الحد الأدنى</span><input type="number" min="0" disabled={readOnly} value={group.min} onChange={(event) => apply({ ...group, min: numberValue(event.target.value) })} /></label>
            <label><span>الحد الأقصى</span><input type="number" min="0" disabled={readOnly} value={group.max ?? ""} placeholder="بلا حد تاجر" onChange={(event) => apply({ ...group, max: event.target.value === "" ? null : numberValue(event.target.value) })} /></label>
            <label><span>الكمية المشمولة</span><input type="number" min="0" disabled={readOnly} value={group.includedQuantity} onChange={(event) => apply({ ...group, includedQuantity: numberValue(event.target.value) })} /></label>
          </div>
        ) : <p className="pc-help">كل حجم يحمل سعر بيع كاملًا مستقلًا، وليس فرق سعر.</p>}
        {!readOnly ? <button type="button" className="pc-wide-action" onClick={() => onChange(appendChoice(configuration, group.id))}><Plus size={15} />{group.type === "SIZE" ? "إضافة حجم" : "إضافة خيار"}</button> : null}
      </aside>
    );
  }

  if (ref.kind === "size") {
    const size = node as SizeChoice;
    return (
      <aside className="pc-inspector">
        <header><span>حجم بسعر كامل</span><code>{size.id}</code></header>
        <label><span>اسم الحجم</span><input disabled={readOnly} value={size.label} onChange={(event) => apply({ ...size, label: event.target.value })} /></label>
        <label><span>السعر الكامل</span><input inputMode="decimal" disabled={readOnly} value={size.price} onChange={(event) => apply({ ...size, price: event.target.value })} /></label>
        <label><span>السعرات (اختياري)</span><input disabled={readOnly} value={size.calories ?? ""} onChange={(event) => apply({ ...size, calories: event.target.value || null })} /></label>
        <Toggle disabled={readOnly} checked={size.available !== false} label="الحجم متاح" onChange={(available) => apply({ ...size, available })} />
        {!readOnly ? <div className="pc-nested-actions"><b>إضافة أسفل الحجم</b><button type="button" onClick={() => onChange(appendChildGroup(configuration, size.id, "OPTIONS"))}>مجموعة خيارات</button></div> : null}
      </aside>
    );
  }

  const option = node as OptionChoice;
  const sizes = collectSizeChoices(configuration);
  return (
    <aside className="pc-inspector">
      <header><span>خيار / Modifier</span><code>{option.id}</code></header>
      <label><span>اسم الخيار</span><input disabled={readOnly} value={option.label} onChange={(event) => apply({ ...option, label: event.target.value })} /></label>
      <label><span>السعر الافتراضي</span><input inputMode="decimal" disabled={readOnly} value={option.price} onChange={(event) => apply({ ...option, price: event.target.value })} /></label>
      <div className="pc-field-grid">
        <label><span>أقل كمية</span><input type="number" min="0" disabled={readOnly} value={option.minQuantity ?? ""} placeholder="0" onChange={(event) => apply({ ...option, minQuantity: event.target.value === "" ? undefined : numberValue(event.target.value) })} /></label>
        <label><span>أقصى كمية</span><input type="number" min="0" disabled={readOnly} value={option.maxQuantity} onChange={(event) => apply({ ...option, maxQuantity: numberValue(event.target.value, 1) })} /></label>
      </div>
      <Toggle disabled={readOnly} checked={option.available !== false} label="الخيار متاح" onChange={(available) => apply({ ...option, available })} />
      {sizes.length ? (
        <section className="pc-size-overrides">
          <b>سعر حسب الحجم</b><small>اتركه فارغًا للرجوع إلى السعر الافتراضي؛ 0 يعني مجانيًا صراحة.</small>
          {sizes.map(({ groupLabel, size }) => {
            const override = option.priceOverrides?.find((item) => item.sizeChoiceId === size.id);
            return <label key={size.id}><span>{groupLabel} / {size.label}</span><input inputMode="decimal" disabled={readOnly} value={override?.price ?? ""} placeholder="السعر الافتراضي" onChange={(event) => {
              const others = (option.priceOverrides ?? []).filter((item) => item.sizeChoiceId !== size.id);
              apply({ ...option, priceOverrides: [...others, { sizeChoiceId: size.id, price: event.target.value === "" ? null : event.target.value }] });
            }} /></label>;
          })}
        </section>
      ) : null}
      {!readOnly ? <div className="pc-nested-actions"><b>مجموعات متداخلة</b><button type="button" onClick={() => onChange(appendChildGroup(configuration, option.id, "OPTIONS"))}>إضافة خيارات</button><button type="button" onClick={() => onChange(appendChildGroup(configuration, option.id, "SIZE"))}>إضافة أحجام</button></div> : null}
      <LinkedProductEditor {...props} option={option} onOptionChange={apply} />
    </aside>
  );
}

export function ConfigurationWorkspace(props: WorkspaceProps) {
  const [selectedRef, setSelectedRef] = useState<EditorNodeRef | null>(null);
  const selected = useMemo(() => selectedRef ? findNode(props.configuration, selectedRef.id) : null, [props.configuration, selectedRef]);
  useEffect(() => {
    if (selectedRef && !selected) setSelectedRef(null);
  }, [selected, selectedRef]);
  return (
    <div className={`pc-workspace ${props.compact ? "compact" : ""}`} dir="rtl">
      <ConfigurationTreePanel {...props} selectedId={selectedRef?.id ?? null} onSelect={setSelectedRef} />
      <NodeInspector {...props} selected={selected} />
    </div>
  );
}
