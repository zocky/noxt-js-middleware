import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "./runtime.js";

export { _jsx as jsx, _jsxs as jsxs, _Fragment as Fragment };

export function createElement(type, props, ...children) {
  return _jsx(type, { ...props, children });
}