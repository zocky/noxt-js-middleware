import { Fragment } from './runtime.js';

export async function renderNode(node, ctx, rootOwner = null, pos = 'single') {
  if (node == null) return '';
  if (Array.isArray(node)) {
    let out = '';
    for (let i = 0; i < node.length; i++) {
      out += await renderNode(node[i], ctx, rootOwner, pos = i === 0 ? 'first' : `rest`);
    }
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') return escapeHTML(String(node));
  if (typeof node === 'boolean') return '';
  if (node.html) return node.html;

  const { type, props = {} } = node;
  const { children, ...rest } = props;

  for (const k in rest) {
    if (typeof rest[k] === 'function') rest[k] = await rest[k]({}, ctx);
    else if (rest[k]?.then) rest[k] = await rest[k];
  }

  if (typeof type === 'function') {
    // keep ownership through Fragment, otherwise adopt component name
    const owner = type === Fragment && rootOwner ? rootOwner : (type.name || 'anon');
    try {
      const rendered = await type({ ...rest, children }, ctx);
      return await renderNode(rendered, ctx, owner);
    } catch (err) {
      return `<noxt-error>${err.message}</noxt-error>`;
    }
  }

  let attr = '';
  /*
  if (rootOwner) {
    rest['data-template'] = rootOwner;
    rest['data-template-' + pos] = true;
  }
  */
  for (const [k, v] of Object.entries(rest)) {

    if (v == null || v === false) continue;
    if (v === true) { attr += ` ${k}`; continue; }
    if (k === 'class') rest[k] = cx(rest[k]);
    attr += ` ${k}="${escapeHTML(String(v))}"`;
  }
  const open = `<${type}${attr}>`;
  const close = `</${type}>`;
  const kids = await renderNode(children, ctx, null);
  return open + kids + close;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// reimplement classnames
function cx(...classes) {
  const ret = new Set();
  _cx(classes, ret);
  return Array.from(ret).join(' ');
}
function _cx(classes, ret = new Set()) {
  if (!classes) return;

  if (Array.isArray(classes)) {
    for (const c of classes) _cx(c, ret);
    return;
  }

  if (isPlainObject(classes)) {
    for (const [key, value] of Object.entries(classes)) {
      if (value) ret.add(key);
    }
    return;
  }

  if (typeof classes === 'string' || typeof classes === 'number') {
    ret.add(String(classes));
  }
}

function isPlainObject(o) {
  return o?.constructor === Object || o?.constructor === null;
}
