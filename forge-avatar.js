/* FORGE / PRIVATE AVATAR ENGINE
 * Loads an existing GLB from the user's device, never from a public asset URL.
 * Optional IndexedDB persistence stays in this browser (not encrypted).
 * No asset, texture, photo or personal name goes into GitHub.
 */
const VIEWER_URL="https://cdnjs.cloudflare.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js";
const DATABASE="forge-personal-avatar-v1",STORE="private-models",MODEL_KEY="current";
const MAX_BYTES=80*1024*1024;
const $=selector=>document.querySelector(selector);

const view=$("#forge-avatar-viewer");
const panel=$(".forge-avatar-panel");
const input=$("#forge-avatar-file");
const empty=$("#forge-avatar-empty");
const openButton=$("#forge-avatar-open");
const replaceButton=$("#forge-avatar-replace");
const remember=$("#forge-avatar-remember");
const forget=$("#forge-avatar-forget");
const selector=$("#forge-avatar-animation");
const turnWrap=$("#forge-avatar-turn-wrap");
const turnSpeed=$("#forge-avatar-turn-speed");
const turnOutput=$("#forge-avatar-turn-output");
const status=$("#forge-avatar-status");
const nameLabel=$("#forge-avatar-file-name");
const presence=$("#forge-avatar-presence");
const motion=$("#forge-motion-toggle");
const hero=$("#forge-hero");
const turnPad=$("#forge-avatar-turn-pad");
const turnButtons=[...document.querySelectorAll("[data-forge-private-turn]")];
const replayTurn=$("#forge-avatar-replay");
const backIdle=$("#forge-avatar-idle");

if(view&&panel&&input&&empty&&openButton&&replaceButton&&remember&&forget&&selector&&status&&nameLabel&&presence){
  let activeUrl=null,activeBlob=null,activeName="",activeInfo=null;
  let enginePromise=null;
  let loadToken=0;

  function say(message,tone="info"){
    status.textContent=message;
    status.dataset.tone=tone;
  }
  function chooser(){input.click();}
  openButton.addEventListener("click",chooser);
  replaceButton.addEventListener("click",chooser);

  function checkGlb(file){
    if(!file || typeof file.size!=="number" || file.size<20)throw Error("Choose a valid .glb model.");
    if(file.size>MAX_BYTES)throw Error("This GLB exceeds 80 MB. Use an optimized model for mobile.");
    if(!/\.glb$/i.test(file.name||""))throw Error("Choose a .glb file, not an image or a .gltf folder.");
    return file.arrayBuffer().then(buffer=>{
      const dv=new DataView(buffer);
      if(dv.getUint32(0,true)!==0x46546c67)throw Error("This file is not a valid GLB.");
      if(dv.getUint32(4,true)!==2)throw Error("Only glTF 2.0 GLB models are supported.");
      if(dv.getUint32(8,true)!==buffer.byteLength)throw Error("The GLB file size does not match its header.");
      const jsonLength=dv.getUint32(12,true),type=dv.getUint32(16,true);
      if(type!==0x4e4f534a || !jsonLength || jsonLength>buffer.byteLength-20)throw Error("The GLB is missing valid scene metadata.");
      let json;
      try{json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)));}
      catch{throw Error("Could not read the GLB scene. The file may be damaged.");}
      if(!json?.asset?.version?.startsWith("2.") || !Array.isArray(json.meshes) || !json.meshes.length)
        throw Error("This GLB does not contain a usable 3D mesh.");
      const resources=[...(json.buffers||[]),...(json.images||[])];
      if(resources.some(resource=>resource.uri && !resource.uri.startsWith("data:")))
        throw Error("For privacy, use a self-contained GLB with embedded textures. External file links are blocked.");
      return {size:buffer.byteLength,meshes:json.meshes.length,animations:Array.isArray(json.animations)?json.animations.map((x,i)=>x.name||"Animation "+(i+1)):[]};
    });
  }

  function dbOpen(){
    return new Promise((resolve,reject)=>{
      if(!("indexedDB" in window)){reject(new Error("This browser doesn't allow local model storage."));return;}
      const request=indexedDB.open(DATABASE,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
      request.onerror=()=>reject(request.error||new Error("Local storage could not open."));
      request.onsuccess=()=>resolve(request.result);
      request.onblocked=()=>reject(new Error("Local model storage is blocked by another tab."));
    });
  }
  async function dbAction(operation,data){
    const db=await dbOpen();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,operation==="read"?"readonly":"readwrite");
        const store=tx.objectStore(STORE);
        let result=null;
        const request=operation==="read"?store.get(MODEL_KEY):operation==="save"?store.put(data,MODEL_KEY):store.delete(MODEL_KEY);
        request.onsuccess=()=>{result=request.result;};
        request.onerror=()=>reject(request.error||new Error("Could not access local model."));
        tx.oncomplete=()=>resolve(result);
        tx.onerror=()=>reject(tx.error||new Error("Local model transaction failed."));
        tx.onabort=()=>reject(tx.error||new Error("Local model transaction was cancelled."));
      });
    }finally{db.close();}
  }

  async function ensureEngine(){
    if(customElements.get("model-viewer"))return;
    if(!enginePromise)enginePromise=import(VIEWER_URL).catch(error=>{enginePromise=null;throw new Error("The 3D viewer could not load. Check your connection and try again.");});
    await enginePromise;
    await customElements.whenDefined("model-viewer");
  }

  // Private-model clip names only: durations are for end-frame hold in preview.
  // No recognizable model is shipped in this public repository.
  const AUTHORED_TURNS=Object.freeze({
    Turn90Left_PrivateV1:1.70,
    Turn90Right_PrivateV1:1.70,
    Turn180Left_PrivateV1:2.58,
    Turn180Right_PrivateV1:2.58,
  });
  const isAuthoredTurn=name=>Object.prototype.hasOwnProperty.call(AUTHORED_TURNS,name);
  function syncTurnPad(){
    const selected=selector.value||"";
    for(const button of turnButtons){
      const active=button.dataset.forgePrivateTurn===selected;
      button.setAttribute("aria-pressed",String(active));
      button.classList.toggle("is-active",active);
    }
    if(replayTurn)replayTurn.disabled=!isAuthoredTurn(selected);
  }
  for(const button of turnButtons){
    button.addEventListener("click",()=>{
      if(button.hidden)return;
      selector.value=button.dataset.forgePrivateTurn;
      selector.dispatchEvent(new Event("change",{bubbles:true}));
    });
  }
  replayTurn?.addEventListener("click",()=>{
    if(!isAuthoredTurn(selector.value))return;
    selector.dispatchEvent(new Event("change",{bubbles:true}));
  });
  backIdle?.addEventListener("click",()=>{
    const idle=[...selector.options].find(option=>/idle|stand|rest/i.test(option.value))?.value||
      selector.options[0]?.value;
    if(!idle)return;
    selector.value=idle;
    selector.dispatchEvent(new Event("change",{bubbles:true}));
  });

  function motionAllowed(){
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
           hero && !hero.classList.contains("forge-still");
  }

  function syncMotion(){
    if(!view || view.hidden)return;
    const name=selector.value||"";
    const authored=isAuthoredTurn(name);
    const legacyTurn=/turn/i.test(name)&&!authored;
    const speed=Math.max(30,Math.min(180,Number(turnSpeed?.value)||85));
    if(turnWrap)turnWrap.hidden=!legacyTurn;
    if(turnOutput)turnOutput.textContent=speed+"°/s";
    view.timeScale=1;
    view.setAttribute("rotation-per-second",(legacyTurn?speed:22)+"deg");
    if(authored){
      // A staged skeletal turn is already rotating the character. The viewer
      // turntable would double-rotate him, and looping would snap back.
      view.removeAttribute("auto-rotate");
      if(!motionAllowed())try{view.pause?.();}catch{}
      return;
    }
    if(motionAllowed()){
      view.setAttribute("auto-rotate","");
      try{if(view.availableAnimations?.length&&typeof view.play==="function")view.play();}catch{}
    }else{
      view.removeAttribute("auto-rotate");
      try{view.pause?.();}catch{}
    }
  }

  function renderAnimations(){
    const available=Array.isArray(view.availableAnimations)?view.availableAnimations:[];
    selector.replaceChildren();
    for(const animation of available){
      const option=document.createElement("option");
      option.value=animation;
      option.textContent=isAuthoredTurn(animation)
        ?animation.replace(/^Turn(90|180)(Left|Right)_PrivateV1$/,(_,deg,dir)=>"Turn "+deg+"° "+dir+" (private test)")
        :animation;
      selector.append(option);
    }
    let anyTurn=false;
    for(const button of turnButtons){
      const found=available.includes(button.dataset.forgePrivateTurn);
      button.hidden=!found;
      anyTurn ||=found;
    }
    if(turnPad)turnPad.hidden=!anyTurn;
    const idle=available.find(x=>/idle|stand|rest/i.test(x))||available[0];
    if(idle){
      selector.value=idle;
      view.setAttribute("animation-name",idle);
      selector.hidden=false;
      syncMotion();
      syncTurnPad();
    }else{
      selector.hidden=true;
      view.removeAttribute("animation-name");
    }
  }
  turnSpeed?.addEventListener("input",syncMotion);
  selector.addEventListener("change",()=>{
    const name=selector.value;
    if(!name)return;
    try{view.pause?.();}catch{}
    view.setAttribute("animation-name",name);
    view.currentTime=0;
    syncMotion();
    syncTurnPad();
    if(isAuthoredTurn(name)){
      // A deliberate click on a turn plays once even when ambient motion is off.
      // Reduced-motion preference still suppresses automatic idle rotation.
      try{view.play({repetitions:1});}catch{}
      say("Owner-approved "+name.replace(/_PrivateV1$/,"")+
          " animation playing once. Repeat or return to idle using the controls below.","success");
    }else{
      say(/turn/i.test(name)
        ?"This source clip does not change your character's facing direction. Turntable speed spins the entire model, not a planted-foot turn."
        :"Now showing "+name+". Drag or swipe to rotate the model.","success");
    }
  });
  view.addEventListener("finished",()=>{
    const name=selector.value;
    if(!isAuthoredTurn(name))return;
    try{view.pause?.();}catch{}
    // Hold close to final pose to avoid a repeat-loop heading snap.
    view.currentTime=Math.max(0,AUTHORED_TURNS[name]-.015);
    say("Turn complete. This motion has your visual approval. Use Replay turn or Back to idle; physical-device testing is still pending.","success");
  });

  async function loadModel(file,{saved=false}={}){
    const token=++loadToken;
    panel.classList.add("is-loading");
    say(saved?"Restoring your private 3D character from this browser…":"Inspecting your local GLB…");
    try{
      const info=await checkGlb(file);
      await ensureEngine();
      if(token!==loadToken)return;
      const url=URL.createObjectURL(file);
      const previous=activeUrl;
      const onload=()=>{
        if(token!==loadToken)return;
        panel.classList.remove("is-loading");
        panel.classList.add("is-loaded");
        empty.hidden=true;
        view.hidden=false;
        presence.textContent="3D CHARACTER · ACTIVE";
        nameLabel.textContent=(file.name||"My character").slice(0,48);
        activeBlob=file;
        activeName=file.name||"My character.glb";
        activeInfo=info;
        forget.hidden=false;
        renderAnimations();
        say("Your character is ready. Drag to rotate the view, pinch to zoom, and choose an animation. Turntable rotation is a display effect.","success");
        if(previous && previous!==url)URL.revokeObjectURL(previous);
      };
      const onerror=()=>{
        if(token!==loadToken)return;
        panel.classList.remove("is-loading");
        view.hidden=true;
        view.removeAttribute("src");
        activeUrl=null;
        URL.revokeObjectURL(url);
        if(previous && previous!==url)URL.revokeObjectURL(previous);
        panel.classList.remove("is-loaded");
        empty.hidden=false;
        say("The renderer couldn't display this GLB. Try the original rigged file or export as glTF 2.0 with embedded textures.","error");
      };
      view.addEventListener("load",onload,{once:true});
      view.addEventListener("error",onerror,{once:true});
      // A local blob: URL is used; no personal model is uploaded to a server.
      activeUrl=url;
      view.hidden=false;
      view.src=url;
    }catch(error){
      if(token!==loadToken)return;
      panel.classList.remove("is-loading");
      say(error.message||"Unable to load this model.","error");
    }
  }

  input.addEventListener("change",async()=>{
    const file=input.files?.[0];
    input.value="";
    if(!file)return;
    await loadModel(file);
    if(remember.checked){
      // Save only after the user has explicitly opted in; do not imply encryption.
      try{
        const info=await checkGlb(file);
        if(!info)return;
        await dbAction("save",{blob:file,name:file.name,savedAt:Date.now()});
        say("Model saved on this device for future visits. It is not uploaded or encrypted.","success");
      }catch(error){
        say("Model preview attempted, but local saving failed: "+(error.message||"Storage unavailable."),"error");
      }
    }
  });

  remember.addEventListener("change",async()=>{
    try{
      if(remember.checked){
        if(!activeBlob){say("Select your GLB first; then it can be remembered on this device.");return;}
        await dbAction("save",{blob:activeBlob,name:activeName,savedAt:Date.now()});
        say("Saved in this browser for automatic loading on future visits. This storage is not encrypted.","success");
      }else{
        await dbAction("remove");
        say("Local saved copy removed. The current preview remains until this tab closes.","success");
      }
    }catch(error){
      remember.checked=!remember.checked;
      say("Couldn't update local storage: "+(error.message||"Storage unavailable."),"error");
    }
  });

  forget.addEventListener("click",async()=>{
    if(!confirm("Remove your locally saved 3D model from this browser? The original GLB file on your device will not be deleted."))return;
    ++loadToken;
    try{await dbAction("remove");}catch(error){say("Unable to clear saved model: "+(error.message||"Storage unavailable."),"error");return;}
    if(activeUrl){URL.revokeObjectURL(activeUrl);activeUrl=null;}
    view.removeAttribute("src");view.hidden=true;empty.hidden=false;
    panel.classList.remove("is-loaded","is-loading");
    activeBlob=null;activeName="";activeInfo=null;
    presence.textContent="PERSONAL MODEL · NOT LOADED";
    nameLabel.textContent="YOUR DEVICE · NO UPLOAD";
    selector.hidden=true;forget.hidden=true;remember.checked=false;
    if(turnPad)turnPad.hidden=true;
    for(const button of turnButtons)button.hidden=true;
    if(replayTurn)replayTurn.disabled=true;
    if(turnWrap)turnWrap.hidden=true;
    if(turnSpeed)turnSpeed.value="85";
    say("Removed from this browser. Your source GLB file is unchanged.","success");
  });

  motion?.addEventListener("click",()=>{
    syncMotion();
    if(isAuthoredTurn(selector.value)&&motionAllowed()){
      view.currentTime=0;
      try{view.play({repetitions:1});}catch{}
    }
  });
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change",syncMotion);
  document.addEventListener("visibilitychange",()=>{if(document.hidden){try{view.pause?.();}catch{}}else syncMotion();});
  window.addEventListener("pagehide",()=>{if(activeUrl)URL.revokeObjectURL(activeUrl);},{once:true});

  // Browser-only remembered models return without a repeated upload.
  (async()=>{
    try{
      const saved=await dbAction("read");
      if(saved?.blob instanceof Blob){
        const restored=new File([saved.blob],saved.name||"my-3d-avatar.glb",{type:"model/gltf-binary"});
        remember.checked=true;
        await loadModel(restored,{saved:true});
      }
    }catch{
      // Private browsing and some managed devices restrict IndexedDB. Manual file
      // selection still works; never fail the dashboard because persistence is off.
    }
  })();
}
