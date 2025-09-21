export const jsx = (type, props, key) => ({ type, props: props || {}, key });
export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = ({ children }) => children;
Fragment.isNoxtFragment = true;

export function createElement(type, props, ...children) {
  return jsx(type, { ...props, children });
}
