

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
  return router;
}
import { renderElement } from "./runtime.js";


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
  const content = await renderElement(name, props, ctx);
  const children = await renderElement(components[layout] ?? components.Layout, { ...props, children: content }, ctx);
  return await renderFinal(children,ctx);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function armorHTML(str) {
  return { html: str }
}


async function renderFinalChild(child,ctx={}) {
  if (child == null) {
    return '';
  }
  if (Array.isArray(child)) {
    return await renderFinal(child,ctx);
  }
  switch (typeof child) {
    case 'function':
      return await renderFinal(await child({}, ctx),ctx);
    case 'boolean':
      return '';
    case 'object':
      if ('html' in child) {
        return child.html;
      }
      return String(child);
    default:
      return escapeHTML(String(child));
  }
}

async function renderFinal(children,ctx={}) {
  let output = "";
  children = [].concat(children).flat(Infinity);
  for (let child of children) {
    output += await renderFinalChild(await child,ctx);
  }
  return output;
}