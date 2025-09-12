import classNames from "classnames";

import { components } from "./index.js";

export const jsx = renderElement;
export const jsxs = renderElement;
export const jsxDEV = renderElement;
export const Fragment = ({children}) => children;

export function createElement(type, props, ...children) {
  return jsx(type, { ...props, children });
}

export async function renderElement(type, { children, ...props } = {}, ctx = {}) {
  if (!type) {
    throw new Error(`Invalid element type: ${type}`);
  }
  ctx = { ...ctx, ...components };
  try {
    for (const key in props) {
      if (typeof props[key] === "function") {
        props[key] = await props[key]({}, ctx);
      } else if (props[key] instanceof Promise) {
        props[key] = await props[key];
      }
    }

    if (typeof type === "function") {
      let result = await type({ ...props, children }, ctx);
      return result;
    }

    const attrStr = Object.entries(props ?? {})
      .map(([k, v]) => {
        if (k === "class") v = classNames(v);
        if (typeof v === "boolean" || v == null) return v ? ` ${k}` : "";
        else if (typeof v === "number" || typeof v === "string") return ` ${k}="${v}"`;
        return "";
      })
      .join("");

    return [{ html: `<${type}${attrStr}>` }, children, { html: `</${type}>\n` }];
  } catch (err) {
    const ErrorComp = ctx.ErrorMessage || (({ error }) => `<pre>${error}</pre>`);
    return await renderElement(ErrorComp, { error: err, template: type?.name }, ctx);
  }
}
