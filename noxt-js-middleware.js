

import path from 'path';

import { Router } from "express";
import { loadModules } from "./src/loadModules.js";
import { renderNode } from './src/renderNode.js';
import Slots from './src/Slots.js';

const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

export { createElement } from "./src/runtime.js";

const NAME_SYMBOL = Symbol.for("noxtName");
const HTTP_VERBS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];

const defaultOptions = {
  views: path.join(process.cwd(), 'views'),
  context: {},
  layout: 'Layout',
  hooks: {}
}

export default async (arg) => {
  const options = {};
  for (const k in defaultOptions) {
    options[k] = arg[k] ?? defaultOptions[k];
  }
  const globalContext = { ...options.context };
  //console.log('[noxt] Global context:', globalContext);
  const components = {};
  const modules = {};
  const pages = {}
  const hooks = options.hooks ?? {};
  for (const id in hooks) {
    const flat = [].concat(hooks[id]).flat(Infinity).filter(Boolean);
    if (!flat.length) continue;
    hooks[id] = async (ctx) => {
      for (const fn of flat) await fn(ctx);
    }
  }

  const router = Router();
  const noxt = (req, res, next) => router(req, res, next);
  Object.assign(noxt, {
    router,
    context: globalContext,
    components,
    options,
    modules,
    pages,
  });
  console.log('[noxt] Views:', options.views);
  await preloadTemplates();
  noxt.layout = typeof options.layout === 'string' ? components[options.layout] : options.layout;

  return router;

  async function createRequestContext(component, req, res) {
    //console.log('Creating request context for', component.noxtName);
    const slots = new Slots();
    let ctx = {
      req, res,
      query: req.query,
      ...noxt.context,
      ...noxt.components,
      slots,
      slot: slots.slot
    };
    await hooks.beforeRequest?.({ ctx, component, module: component.noxtModule });
    return ctx;
  }


  function createComponent(name, module, fn) {
    if (!name.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
      throw new Error(`Invalid function name: ${name}`);
    }
    async function Component(props, ctx) {
      props ??= {}
      for (const id in module.params ?? {}) {
        props[id] = module.params[id](props, ctx);
      }

      await hooks.beforeRender?.({ module, props, ctx });
      //console.log('Render', name, ...Object.keys(props));
      return fn(props, ctx);
    }

    return new Function(
      'Component',
      `return async function ${name}(props, ctx) {
       return Component(props, ctx);
     }`
    )(Component);
  }


  /**
   * 
   * Creates a component
   * 
   * @param {*} name - component name
   * @param {*} module - module which provides export loaders for this component
   * @param {*} render - component render function, takes props and context
   */

  function makeComponent(name, module, render) {
    const component = createComponent(name, module, render);
    Object.assign(component, {
      isNoxtComponent: true,
      noxtName: name,
      noxtModule: module,
      evaluateWithRequest: async (props, req, res, extra = {}) => {
        const ctx = { ...await createRequestContext(component, req, res), ...extra };
        return await component(props, ctx);
      },
      renderWithRequest: async (props, req, res, extra = {}) => {
        const ctx = { ...await createRequestContext(component, req, res), ...extra };
        const evaluated = await component(props, ctx);
        return { html: await renderNode(evaluated, ctx) };
      }
    })
    return component;
  }

  function registerComponent(name, module) {
    components[name] = makeComponent(name, module, module.default);
    if (module.route) {
      registerPage(components[name]);
    }
  }

  function registerPage(component) {
    console.log('[noxt] Page', component.noxtName);
    const module = component.noxtModule;
    const routes = [].concat(module.route);
    const name = component.noxtName;

    for (const id in module.params ?? {}) {
      if (module.params[id] instanceof AsyncFunction) {
        throw new Error('Async params normalizers not supported');
      }
    }
    
    Object.assign(component, {
      isNoxtPage: true,
      getRoutePath: (params,ctx) => {
        ctx ??= {...noxt.context, ...noxt.components};
        for (const id in module.params ?? {}) {
          params[id] = module.params[id](params, ctx);
        }
        return routes[0].replace(/:([^\/]+)/g, ($$, $1) => {
          if ($1 in params) return params[$1];
          throw new Error(`Missing param ${$1}`);
        });
      }
    })

    function createMiddleware(verb) {
      return async function (req, res) {
        const props = { ...req.params };
        const ctx = await createRequestContext(verb, req, res);
        res.send(await renderWithLayout(verb, props, ctx, ctx.layout ?? module.layout ?? noxt.layout));
      }
    }
    const verbs = {};
    for (const v of HTTP_VERBS) {
      const method = v === 'GET' ? module.GET ?? module.default : module[v];
      if (!method) continue;
      const verb = makeComponent(name + '__' + v, module, method);
      const mw = createMiddleware(verb);
      const m = v.toLowerCase();
      verbs[m] = mw;
    }
    for (const r of routes) {
      console.log('[noxt]', Object.keys(verbs).map(v => v.toUpperCase()).join('|'), r, '->', name);
      for (const v in verbs) noxt.router[v](r, verbs[v]);
    }

    hooks.registerPage?.({ name, module, component });
  }

  async function preloadTemplates() {
    const modules = noxt.modules = await loadModules(options.views);
    for (const name in modules) {
      registerComponent(name, modules[name]);
    }
  }


  async function renderWithLayout(component, props, ctx, layout) {
    // build AST for the inner page
    const pageAst = { type: component, props };          // element AST
    const rendered = await renderNode(pageAst, ctx);

    const layoutComponent = typeof layout === 'string' ? components[layout] : layout;
    if (!layoutComponent) {
      return rendered;
    }
    const layoutAst = { type: layoutComponent, props: { body: rendered } };

    return renderNode(layoutAst, ctx);
  };
}

