// Core glTF 2 only. The validator receives no resolver capable of file or network access.
const {parentPort, workerData} = require("node:worker_threads");
const {validateBytes} = require("gltf-validator");
async function accepts() {
  const bytes = Buffer.from(workerData.bytes);
  let json = bytes;
  if (workerData.extension === ".glb") {
    if (bytes.length < 20 || bytes.toString("ascii",0,4)!=="glTF" || bytes.readUInt32LE(4)!==2 ||
        bytes.readUInt32LE(8)!==bytes.length || bytes.toString("ascii",16,20)!=="JSON") return false;
    const size = bytes.readUInt32LE(12);
    if (size>bytes.length-20) return false;
    json = bytes.subarray(20,20+size);
  }
  const model = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(json));
  if (model.asset?.version!=="2.0" || model.extensionsUsed?.length || model.extensionsRequired?.length) return false;
  // Document budgets also cap client work caused by sparse accessors and graph fan-out.
  if ((model.nodes?.length??0)>4096 || (model.meshes?.length??0)>1024 ||
      (model.accessors??[]).reduce((n,a)=>n+a.count,0)>3000000 ||
      (model.buffers??[]).reduce((n,b)=>n+b.byteLength,0)>16*1024*1024) return false;
  const stack = [model]; let count=0;
  while (stack.length) {
    const item=stack.pop();
    if (++count>150000 || item.extensions && Object.keys(item.extensions).length) return false;
    for (const [key,val] of Object.entries(item)) {
      if (key==="uri" && (typeof val!=="string" || !/^data:(?:application\/(?:gltf-buffer|octet-stream)|image\/(?:jpeg|png));base64,[a-zA-Z0-9+/]+=*$/.test(val))) return false;
      if (val && typeof val==="object") stack.push(val);
    }
  }
  const report=await validateBytes(bytes,{format:workerData.extension.slice(1),maxIssues:32,
    externalResourceFunction:async()=>{throw Error("External resources are not supported");}});
  if (report.issues.numErrors || report.issues.truncated) return false;
  let pixels=0;
  for(const resource of report.info?.resources??[]) {
    if(resource.image) {
      if(!["image/png","image/jpeg"].includes(resource.mimeType) || !resource.image.width || !resource.image.height) return false;
      pixels+=resource.image.width*resource.image.height;
    }
  }
  return pixels<=16000000;
}
accepts().then(ok=>parentPort.postMessage(ok),()=>parentPort.postMessage(false));
