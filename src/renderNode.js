import { Fragment } from './runtime.js';

export async function renderNode(rootNode, ctx) {
  /* ---------- helpers ---------- */

  console.time('renderNode');
  const esc = str => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const cx = (...args) => {
    const classes = args.flat(Infinity).filter(Boolean).map(it =>
      typeof it === 'object' ? Object.keys(it).filter(k => it[k]).join(' ') : it
    );
    return [...new Set(classes)].join(' ');
  };

  /* ---------- stack ---------- */
  const rootBuf = [];                       // final output chunks
  const buffers = new Map();                // bufId -> chunk[]
  let bufIdSeq = 0;                         // simple unique id

  const stack = [{
    node: rootNode,
    owner: null,
    pos: 'single',
    phase: 'enter',
    bufId: null,        // null means “write into parent target”
    target: rootBuf     // array to push into
  }];

  while (stack.length) {
    const cur = stack.pop();
    const { node, owner, pos, phase, bufId, target } = cur;

    /* ---------- ENTER ---------- */
    if (phase === 'enter') {
      if (node == null) continue;
      if (typeof node === 'boolean') continue;

      // primitives
      if (typeof node === 'string' || typeof node === 'number') {
        target.push(esc(String(node)));
        continue;
      }
      if ('html' in node) {
        target.push(node.html);
        continue;
      }

      // arrays
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) {
          stack.push({
            node: node[i],
            owner,
            pos: i === 0 ? 'first' : 'rest',
            phase: 'enter',
            bufId: null,
            target
          });
        }
        continue;
      }

      const { type, props = {} } = node;
      const { children, ...rest } = props;

      // resolve async / functional props
      for (const k in rest) {
        if (rest[k]?.then) rest[k] = await rest[k];
      }

      // components
      if (typeof type === 'function') {
        const compOwner = type === Fragment && owner ? owner : (type.name || 'anon');
        try {
          const rendered = await type({ ...rest, children }, ctx);
          stack.push({
            node: rendered,
            owner: compOwner,
            pos,
            phase: 'enter',
            bufId: null,
            target
          });
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error(`Error in ${compOwner}: ${err.message}`);
            target.push(`<noxt-error>Error in ${compOwner}: ${err.message} (${err.stack})</noxt-error>`);
          } else {
            target.push(`<noxt-error>Error in ${compOwner}: ${err.message}</noxt-error>`);
          }
        }
        continue;
      }

      if (!type) {
       target.push('<noxt-error>'+JSON.stringify(node)+'</noxt-error>');
       continue;
      }

      // elements
      const kidsBufId = ++bufIdSeq;
      const kidsBuf = [];
      buffers.set(kidsBufId, kidsBuf);

      // dev attributes
      if (process.env.NODE_ENV !== 'production' && owner) {
        rest['data-template'] = owner;
        rest['data-template-' + pos] = true;
      }

      // build open tag
      let attr = '';
      for (const [k, v] of Object.entries(rest)) {
        if (v == null || v === false) continue;
        if (v === true) { attr += ` ${k}`; continue; }
        if (k === 'class') { attr += ` class="${cx(v)}"`; continue; }
        attr += ` ${k}="${esc(String(v))}"`;
      }
      const open = `<${type}${attr}>`;
      const close = `</${type}>`;

      // schedule: exit → kids → children
      stack.push({
        node: { open, close },
        owner,
        pos,
        phase: 'exit',
        bufId: kidsBufId,
        target
      });
      stack.push({
        node: children,
        owner: null,
        pos: 'single',
        phase: 'enter',
        bufId: null,
        target: kidsBuf
      });
    }

    /* ---------- EXIT ---------- */
    else if (phase === 'exit') {
      const { open, close } = node;
      const kidsChunks = buffers.get(bufId);
      buffers.delete(bufId);
      target.push(open + kidsChunks.join('') + close);
    }
  }
  console.timeEnd('renderNode');
  return rootBuf.join('');
}