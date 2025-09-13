import classNames from "classnames";

import { components } from "./index.js";

export const jsx = (type, props, key) => ({ type, props: props || {}, key });
export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = ({ children }) => children;

export function createElement(type, props, ...children) {
  return jsx(type, { ...props, children });
}
