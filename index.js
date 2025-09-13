

import fs from "fs/promises";
import { pathToFileURL } from "url";
import path from 'path';

import { Router } from "express";
import esbuild from "esbuild";

export { createElement } from "./runtime.js";

export default async ({
  directory = path.join(process.cwd(), 'views'),
  context = {},
} = {}) => {
  const router = Router();
  let directories = [].concat(directory).flat();
  for (const dir of directories) {
    await preloadTemplates(router, dir, context);
  }
  Object.assign(components, context);
  return router;
}

export const components = {};
const moduleCache = {};

const specialKeys = new Set(['req', 'res', 'query']);

const exportLoaders = {
  params: async (value, props, ctx) => {
    if (typeof value === 'function') {
      Object.assign(props, await value(props, ctx));
      return;
    }
    for (const [key, func] of Object.entries(value)) {
      if (typeof func === 'function') {
        props[key] = await func(props, ctx);
      } else {
        props[key] = func;
      }
    }
  }
}

export function registerPageExportHandler(name, loader) {
  exportLoaders[name] = loader;
}

async function preloadTemplates(router, directory, context = {}) {

  for (const key in context) {
    // only allow non-capitalized, non-special keys
    if (specialKeys.has(key) || key[0] === key[0].toUpperCase()) {
      throw new Error(`Context key "${key}" is not allowed. Context keys must not start with a capital letter and must not be one of: ${[...specialKeys].join(', ')}`);
    }
  }

  const files = await fs.readdir(directory, {
    recursive: true,
    withFileTypes: true
  });

  const templateFiles = files.filter(file =>
    file.isFile() && file.name.endsWith(".jsx")
  );

  for (const file of templateFiles) {
    const fullPath = path.join(file.parentPath ?? file.path, file.name);
    const name = path.basename(file.name, '.jsx');

    // skip if not capitalized
    if (name[0] !== name[0].toUpperCase()) {
      console.log(`Skipping non-capitalized template: ${name}`);
      continue;
    }

    if (name in components) {
      throw new Error(`Duplicate template name found: "${name}". Template names must be unique across all directories.`);
    }
    const module = await loadModule(fullPath, name);
    moduleCache[name] = module;
    components[name] = module.default;

    if (module.route) {
      // this module is a page
      const handler = renderPage(module, context);
      for (const r of [].concat(module.route)) {
        console.log(`Registering route: ${r} -> ${name}`);
        router.get(r, handler);
      }
    }
  }
}


async function loadModule(filePath) {
  const source = await fs.readFile(filePath, "utf8");

  let { code } = await esbuild.transform(source, {
    target: 'ES2020',
    jsx: 'automatic',
    loader: "jsx",
    jsxFactory: "jsx",
    jsxFragment: "Fragment",
    jsxImportSource: "noxt-js-middleware",
  });

  const modulePath = filePath + ".mjs";
  // Wrap in runtime imports
  const moduleUrl = pathToFileURL(modulePath).href + "?update=" + Date.now();
  await fs.writeFile(modulePath, `${code}`, { encoding: "utf8" });
  const module = await import(moduleUrl);
  // Clean up the temporary file
  await fs.unlink(modulePath);
  return module;
}

function renderPage(module, context = {}) {
  return async function (req, res) {
    const props = { ...req.params };
    const ctx = { ...components, ...context, req, res, query: req.query };

    try {
      for (const id in exportLoaders) {
        if (id in module) {
          await exportLoaders[id](module[id], props, ctx);
        }
      }
      const handler = module[req.method.toUpperCase()] ?? module.default;
      if (!handler) {
        res.status(405).send("Method not allowed");
        return;
      }
      res.send(await renderWithLayout(handler, props, ctx, module.layout));
    } catch (e) {
      res.status(500).send(await renderWithLayout(components.ErrorMessage, { error: e, template: module.name }, ctx));
    }
  }
}
// Express middleware to render a template with optional layout

export const renderWithLayout = async (name, props, ctx, layout) => {
  // build AST for the inner page
  const pageAst = typeof name === 'function'
    ? await name(props, ctx)          // page component already executed
    : { type: name, props };          // element AST

  // build AST for the layout, injecting pageAst as `children`
  const layoutName = components[layout] ?? components.Layout;
  const layoutAst = { type: layoutName, props: { ...props, children: pageAst } };

  // single walk produces the final string
  return renderNode(layoutAst, ctx);
};

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function renderNode(node, ctx) {
  if (node == null) return '';
  if (Array.isArray(node)) {
    let out = '';
    for (const n of node) out += await renderNode(n, ctx);
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') return escapeHTML(String(node));
  if (typeof node === 'boolean') return '';
  if (node.html) return node.html;                 // raw HTML chunk

  // AST node: { type, props }
  const { type, props = {} } = node;
  const { children, ...rest } = props;

  // resolve props (functions, promises, className)
  for (const k in rest) {
    if (typeof rest[k] === 'function') rest[k] = await rest[k]({}, ctx);
    else if (rest[k]?.then) rest[k] = await rest[k];
    if (k === 'class') rest[k] = (await import('classnames')).default(rest[k]);
  }

  if (typeof type === 'function') {                // component
    const rendered = await type({ ...rest, children }, ctx);
    return await renderNode(rendered, ctx);
  }

  // plain element
  let attr = '';
  for (const [k, v] of Object.entries(rest)) {
    if (v == null || v === false) continue;
    if (v === true) { attr += ` ${k}`; continue; }
    attr += ` ${k}="${escapeHTML(String(v))}"`;
  }
  const open = `<${type}${attr}>`;
  const close = `</${type}>`;
  const kids = await renderNode(children, ctx);
  return open + kids + close;
}

