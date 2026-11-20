// Layer tree: top of the list = front-most layer. Drag rows to reorder or to
// move layers into/out of groups; rename by double-clicking.
import { useEffect, useMemo, useState } from "react";
import { moveElementTo, updateElement } from "../model/ops.ts";
import { ancestorsOf, isHiddenInTree } from "../model/tree.ts";
import type { Element } from "../model/types.ts";
import { deleteSelection, groupSelection, select, setFlag, ungroupSelection } from "../store/actions.ts";
import { commit, setState, useEditor } from "../store/editor.ts";
import { Icon } from "./Icon.tsx";
import type { UiIconName } from "../icons/catalog.ts";

interface Row {
  el: Element;
  depth: number;
  parentId: string | null;
  index: number;
}

const TYPE_ICON: Record<Element["type"], UiIconName> = { text: "type", image: "image", shape: "square", icon: "star", group: "group" };

type DropPos = "before" | "after" | "inside";

export function LayersPanel() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null);

  // Reveal selected layers inside collapsed groups.
  useEffect(() => {
    if (!doc) return;
    const need = selection.flatMap((id) => ancestorsOf(doc.elements, id).map((g) => g.id)).filter((id) => !expanded.has(id));
    if (need.length) setExpanded((e) => new Set([...e, ...need]));
  }, [selection, doc]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const visit = (list: Element[], depth: number, parentId: string | null) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const el = list[i];
        out.push({ el, depth, parentId, index: i });
        if (el.type === "group" && expanded.has(el.id)) visit(el.children, depth + 1, el.id);
      }
    };
    if (doc) visit(doc.elements, 0, null);
    return out;
  }, [doc, expanded]);

  if (!doc) return null;
  const sel = new Set(selection);

  const onDrop = (row: Row, pos: DropPos) => {
    if (!drag || drag === row.el.id) return;
    commit((d) => {
      if (pos === "inside" && row.el.type === "group") return moveElementTo(d, drag, row.el.id, row.el.children.length);
      // The list is shown front-to-back, so "above" a row means a higher index.
      return moveElementTo(d, drag, row.parentId, pos === "before" ? row.index + 1 : row.index);
    });
    if (pos === "inside") setExpanded((e) => new Set([...e, row.el.id]));
  };

  return (
    <section className="panel layers" aria-label="Layers">
      <div className="panel__head">
        <h2>Layers</h2>
        <div className="row" style={{ gap: 0 }}>
          <button className="icon-btn icon-btn--sm" title="Group (Ctrl+G)" aria-label="Group selected layers" disabled={selection.length < 2} onClick={groupSelection}>
            <Icon name="group" />
          </button>
          <button className="icon-btn icon-btn--sm" title="Ungroup (Ctrl+Shift+G)" aria-label="Ungroup" disabled={selection.length === 0} onClick={ungroupSelection}>
            <Icon name="ungroup" />
          </button>
          <button className="icon-btn icon-btn--sm" title="Delete (Del)" aria-label="Delete selected layers" disabled={selection.length === 0} onClick={deleteSelection}>
            <Icon name="trash" />
          </button>
        </div>
      </div>
      <div className="layers__list" role="tree" aria-label="Layer tree" data-testid="layers" onClick={(e) => e.target === e.currentTarget && select([])}>
        {rows.map((row) => {
          const { el } = row;
          const hidden = isHiddenInTree(doc.elements, el.id);
          const asset = el.type === "image" && el.assetId ? doc.assets.find((a) => a.id === el.assetId) : null;
          const dropCls = drop?.id === el.id ? ` layer--drop-${drop.pos}` : "";
          return (
            <div
              key={el.id}
              role="treeitem"
              aria-selected={sel.has(el.id)}
              aria-expanded={el.type === "group" ? expanded.has(el.id) : undefined}
              aria-level={row.depth + 1}
              className={`layer${hidden ? " layer--hidden" : ""}${dropCls}`}
              style={{ paddingLeft: 6 + row.depth * 14 }}
              data-testid="layer-row"
              data-layer-name={el.name}
              draggable={renaming !== el.id}
              onDragStart={(e) => {
                setDrag(el.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", el.id);
              }}
              onDragEnd={() => {
                setDrag(null);
                setDrop(null);
              }}
              onDragOver={(e) => {
                if (!drag || drag === el.id) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const f = (e.clientY - r.top) / r.height;
                const pos: DropPos = el.type === "group" && f > 0.3 && f < 0.7 ? "inside" : f < 0.5 ? "before" : "after";
                if (drop?.id !== el.id || drop.pos !== pos) setDrop({ id: el.id, pos });
              }}
              onDragLeave={() => setDrop((d) => (d?.id === el.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                if (drop) onDrop(row, drop.pos);
                setDrop(null);
                setDrag(null);
              }}
              onClick={(e) => select([el.id], e.ctrlKey || e.metaKey ? "toggle" : e.shiftKey ? "add" : "replace")}
              onMouseEnter={() => setState({ hoverId: el.id })}
              onMouseLeave={() => setState({ hoverId: null })}
            >
              <button
                className="layer__twisty"
                aria-label={expanded.has(el.id) ? "Collapse" : "Expand"}
                style={{ visibility: el.type === "group" ? "visible" : "hidden" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((s) => {
                    const n = new Set(s);
                    if (n.has(el.id)) n.delete(el.id);
                    else n.add(el.id);
                    return n;
                  });
                }}
              >
                <Icon name={expanded.has(el.id) ? "chevron-down" : "chevron-right"} size={12} />
              </button>
              <span className="layer__type">
                <Icon name={TYPE_ICON[el.type]} size={13} />
              </span>
              <span className="layer__name" onDoubleClick={() => setRenaming(el.id)}>
                {renaming === el.id ? (
                  <input
                    className="input"
                    autoFocus
                    defaultValue={el.name}
                    aria-label="Rename layer"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== el.name) commit((d) => updateElement(d, el.id, { name }));
                      setRenaming(null);
                    }}
                  />
                ) : (
                  el.name
                )}
              </span>
              {asset && asset.integrity === "protected" && (
                <span title="Protected original" style={{ color: "var(--ink-faint)", display: "grid" }}>
                  <Icon name="shield-check" size={12} />
                </span>
              )}
              {el.type === "image" && !el.assetId && <span className="badge badge--warning">Empty</span>}
              <span className={`layer__flags${el.locked || !el.visible ? " layer__flags--on" : ""}`}>
                <button
                  aria-label={el.visible ? "Hide layer" : "Show layer"}
                  aria-pressed={!el.visible}
                  title={el.visible ? "Hide" : "Show"}
                  data-testid="layer-visibility"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlag([el.id], "visible", !el.visible);
                  }}
                >
                  <Icon name={el.visible ? "eye" : "eye-off"} size={13} />
                </button>
                <button
                  aria-label={el.locked ? "Unlock layer" : "Lock layer"}
                  aria-pressed={el.locked}
                  title={el.locked ? "Unlock" : "Lock"}
                  data-testid="layer-lock"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlag([el.id], "locked", !el.locked);
                  }}
                >
                  <Icon name={el.locked ? "lock" : "lock-open"} size={13} />
                </button>
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <p className="hint" style={{ padding: "8px 16px" }}>No layers yet. Add text, shapes, icons or images from the left.</p>}
      </div>
    </section>
  );
}
