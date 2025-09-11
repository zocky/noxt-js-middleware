import classNames from "classnames";

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


async function renderChildren(input) {
  const result = [];
  async function walk(node) {
    const value = await node;
    if (value == null || value === false || value === true) return;
    if (Array.isArray(value)) {
      await Promise.all(value.map(walk));
    } else {
      result.push(String(value));
    }
  }
  await walk(input);
  return result.join("");
}

export async function renderElement(type, { children, ...props } = {}, ctx = {}) {
  const comps = ctx.__components || {};
  try {
    for (const key in props) {
      if (typeof props[key] === "function") {
        props[key] = await props[key]({}, ctx);
      } else if (props[key] instanceof Promise) {
        props[key] = await props[key];
      }
    }
    const childStr = await renderChildren(children);

    if (typeof type === "function") {
      let result = await type({ ...props, children }, ctx);
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

    return `<${type}${attrStr}>${childStr}</${type}>`;
  } catch (err) {
    const ErrorComp = comps.ErrorMessage || (({ error }) => `<pre>${error}</pre>`);
    return await renderElement(ErrorComp, { error: err, template: type?.name }, ctx);
  }
}
