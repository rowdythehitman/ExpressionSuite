import { useEffect, useRef } from "react";
import type { TreeNode } from "../../bridge";
import { copyText } from "../clipboard";
import { referenceFor, useIde } from "../store";

export interface MenuAt {
  x: number;
  y: number;
  node: TreeNode;
}

interface Item {
  label: string;
  run: () => void;
}

function itemsFor(node: TreeNode): Item[] {
  const ide = useIde.getState();
  const copy = async () => {
    const ref = referenceFor(useIde.getState(), node.key);
    if (!ref) return;
    await copyText(ref.code);
    ide.setStatus({ kind: "info", text: ref.warning ?? `Copied ${ref.code}` });
  };
  const items: Item[] = [{ label: node.kind === "layer" ? "Copy layer reference" : "Copy reference", run: copy }];
  if (node.kind === "property" && node.expression) {
    items.push(
      node.expressionEnabled === false
        ? { label: "Enable expression", run: () => ide.setExpressionEnabled(node.key, true) }
        : { label: "Disable expression", run: () => ide.setExpressionEnabled(node.key, false) },
      {
        label: "Remove expression",
        run: () => {
          if (window.confirm(`Remove the expression on ${node.name}? (Undo in After Effects brings it back.)`)) ide.removeExpression(node.key);
        },
      },
    );
  }
  if (node.kind === "layer") {
    const pinned = ide.pinned.includes(node.name);
    items.push({ label: pinned ? "Unpin" : "Pin to top", run: () => ide.togglePin(node.name) });
  }
  items.push({ label: "Reveal in timeline", run: () => ide.revealInTimeline(node.key) });
  return items;
}

export function ContextMenu({ at, onClose }: { at: MenuAt; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    ref.current?.querySelector("button")?.focus();
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Keep the menu inside the panel.
  const left = Math.min(at.x, window.innerWidth - 200);
  const top = Math.min(at.y, window.innerHeight - 140);
  return (
    <div className="context-menu" role="menu" ref={ref} style={{ left, top }}>
      {itemsFor(at.node).map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
