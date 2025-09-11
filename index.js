

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
  await preloadTemplates(router, directory, context);
  return router;
}
import { renderElement } from "./runtime.js";


export const components = {};
const moduleCache = {};

const specialKeys = new Set(['req', 'res', 'query']);

async function preloadTemplates(router, directory, context={}) {

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
    const fullPath = path.join(file.parentPath, file.name);
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

function renderPage(module, context={}) {
  return async function (req, res) {
    const props = { ...req.params };
    const ctx = { ...components, ...context, req, res, query: req.query };
    try {
      if (module.params) {
        let data = typeof module.params === 'function'
          ? await module.data(props, ctx)
          : module.params;

        for (const [key, func] of Object.entries(data)) {
          if (typeof func === 'function') {
            props[key] = await func(props, ctx);
          }
        }
      }
      res.send(await renderWithLayout(module.default, props, ctx, module.layout));
    } catch (e) {
      res.status(500).send(await renderWithLayout(components.ErrorMessage, { error: e, template: module.name }, ctx));
    }
  }
}
// Express middleware to render a template with optional layout


export const renderWithLayout = async (name, props, ctx, layout) => {
  const children = await renderElement(name, props, ctx);
  return await renderElement(components[layout] ?? components.Layout, { ...props, children }, ctx);
}