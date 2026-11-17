import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { SaxesParser } from "saxes";
import { Worker } from "node:worker_threads";
import { join } from "node:path";

const svgElements = new Set(["svg", "g", "path", "rect", "line", "circle", "ellipse", "polygon", "polyline", "title", "desc"]);
const numbers = new Set(["x","y","x1","x2","y1","y2","cx","cy","r","rx","ry","width","height","stroke-width","opacity","fill-opacity","stroke-opacity"]);
const paint = /^(?:none|currentColor|transparent|black|white|red|green|blue|gray|grey|#[a-f0-9]{3,8})$/i;
function invalid(): never { throw new BadRequestException("Unsupported or invalid media content"); }
function svgAttribute(name: string, value: string): boolean {
  if (numbers.has(name)) return /^-?(?:\d+\.?\d*|\.\d+)(?:px|%)?$/.test(value);
  if (name === "fill" || name === "stroke") return paint.test(value);
  if (name === "viewBox" || name === "points") return /^[0-9.,+eE\s-]+$/.test(value);
  if (name === "d") return /^[MmZzLlHhVvCcSsQqTtAaEe0-9.,+\s-]+$/.test(value);
  if (name === "transform") return /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([0-9.,+eE\s-]+\)\s*)+$/.test(value);
  if (name === "stroke-linecap") return ["round","square","butt"].includes(value);
  if (name === "stroke-linejoin") return ["round","bevel","miter"].includes(value);
  if (name === "fill-rule") return ["nonzero","evenodd"].includes(value);
  return false;
}

export function validateSvg(bytes: Buffer) {
  if (!bytes.length || bytes.length > 256 * 1024) invalid();
  const ns = "http://www.w3.org/2000/svg";
  const parser = new SaxesParser({ xmlns: true });
  let nodes = 0, depth = 0;
  parser.on("doctype", invalid);
  parser.on("processinginstruction", invalid);
  parser.on("cdata", invalid);
  parser.on("error", invalid);
  parser.on("xmldecl", d => { if (d.encoding && !/^utf-8$/i.test(d.encoding)) invalid(); });
  parser.on("opentag", tag => {
    if (++nodes > 2048 || ++depth > 24 || tag.uri !== ns || !svgElements.has(tag.name) ||
        (nodes === 1 && tag.name !== "svg") || Object.keys(tag.attributes).length > 32) invalid();
    for (const a of Object.values(tag.attributes)) {
      if (a.name === "xmlns" && a.value === ns) continue;
      if (a.uri || !svgAttribute(a.name,a.value)) invalid();
    }
  });
  parser.on("closetag", () => { depth--; });
  try { parser.write(new TextDecoder("utf-8",{fatal:true}).decode(bytes)).close(); }
  catch { invalid(); }
  if (!nodes || depth) invalid();
}

let running = 0;
export async function validateModel(bytes: Buffer, extension: string) {
  if (extension === ".usdz") throw new BadRequestException("USDZ import requires reviewed USD assets. Upload a self-contained GLB or glTF model.");
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) invalid();
  if (running >= 2) throw new ServiceUnavailableException("Model validation is busy");
  running++;
  try {
    const worker = new Worker(join(__dirname,"model-worker.cjs"), {
      workerData:{bytes,extension}, resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16}
    });
    try {
      const accepted = await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), 5000);
        const finish = (ok: boolean) => { clearTimeout(timer); resolve(ok); };
        worker.once("error", () => finish(false));
        worker.once("exit", () => finish(false));
        worker.once("message", ok => finish(ok === true));
      });
      if (!accepted) invalid();
    } finally { await worker.terminate(); }
  } finally { running--; }
}
