// Builds the two browser bundles into the site's assets folder.
//   cd tools/editor && npm install && npm run build
import { build } from "esbuild";

const common = { bundle: true, format: "esm", minify: true, target: "es2020", legalComments: "none", logLevel: "info" };

await build({ ...common, entryPoints: ["src/editor.js"], outfile: "../../assets/admin/editor-bundle.js" });
await build({ ...common, entryPoints: ["src/sanitize.js"], outfile: "../../assets/sanitize-bundle.js" });
