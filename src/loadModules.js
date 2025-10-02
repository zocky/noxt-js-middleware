import esbuild from "esbuild";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function loadModules(directories, modules = {}) {

  directories = [].concat(directories).flat();

  const files = [];
  for (const dir of directories) {
    const dirPath = path.resolve(process.cwd(), dir);
    const filesInDir = await fs.readdir(dirPath, {
      recursive: true,
      withFileTypes: true
    });
    files.push(...filesInDir.filter(file => file.isFile() && file.name.endsWith(".jsx")
    ));
  }
  for (const file of files) {
    const fullPath = path.join(file.parentPath ?? file.path, file.name);
    const name = path.basename(file.name, '.jsx');

    // skip if not capitalized
    if (name[0] !== name[0].toUpperCase()) {
      console.log(`[noxt] Skipping non-capitalized template: ${name}`);
      continue;
    }

    if (name in modules) {
      throw new Error(`[noxt] Duplicate template name found: "${name}". Template names must be unique across all directories.`);
    }
    const module = await loadModule(fullPath, name);
    modules[name] = module;
  }
  return modules;
}


async function loadModule(filePath) {
  try {
    const source = await fs.readFile(filePath, "utf8");

    let { code } = await esbuild.transform(source, {
      target: 'ES2020',
      jsx: 'automatic',
      loader: "jsx",
      jsxFactory: "jsx",
      jsxFragment: "Fragment",
      jsxImportSource: "###",
    });

    // there must be a less stupid way
    const realRuntime = path.resolve(__dirname, "..", "jsx-runtime.js");

    // chop off the first line from code
    const firstNewlineIndex = code.indexOf("\n");
    const firstLine = code.slice(0, firstNewlineIndex).replace("###/jsx-runtime", realRuntime);
    code = firstLine + '\n' + code.slice(firstNewlineIndex);
    const modulePath = filePath + ".mjs";
    // Wrap in runtime imports
    const moduleUrl = pathToFileURL(modulePath).href + "?update=" + Date.now();
    await fs.writeFile(modulePath, `${code}`, { encoding: "utf8" });
    const module = await import(moduleUrl);
    // Clean up the temporary file
    await fs.unlink(modulePath);
    return module;
  } catch (e) {
    throw new Error(`[noxt] Error loading module ${filePath}: ${e.message}`);
  }
}
