import classNames from "classnames";

import { components } from "./index.js";

export const jsxs = jsx;

export function createElement(type, props, ...children) {
  return jsx(type, { ...props, children });
}

export async function Fragment({ children }) {
  return await renderChildren(children);
}

export async function jsx(type, props = {}, key) {
  return await renderElement(type, props);
}


async function renderChildren2(input) {
  const result = [];

  async function walk(node) {
    const value = await node;
    if (value == null || value === false || value === true) {
      return;
    }

    if (Array.isArray(value)) {
      // Process array items sequentially to preserve order
      for (const item of value) {
        await walk(item);
      }
    } else {
      result.push(String(value));
    }
  }
  await walk(input);
  return result.join("");
}

async function renderChildren(children,ctx={}) {
  let childStr = "";
  for (let child of [].concat(children).flat(Infinity)) {
    if (typeof child === 'function') {
      child = await renderChildren(await child({}, ctx),ctx);
    } else {
      child = await Promise.resolve(child);
    }
    if (typeof child === 'boolean') {
      child = '';
    }
    child = String(child ?? '');
    childStr += child ?? '';
  }
  return childStr;
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
    const childStr = await renderChildren(children,ctx);

    if (typeof type === "function") {
      let result = await type({ ...props, children: childStr }, ctx);
      result = await renderChildren(result);
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

    return `<${type}${attrStr}>${childStr}</${type}>\n`;
  } catch (err) {
    const ErrorComp = ctx.ErrorMessage || (({ error }) => `<pre>${error}</pre>`);
    return await renderElement(ErrorComp, { error: err, template: type?.name }, ctx);
  }
}
