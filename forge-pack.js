/* FORGE — cooked batch packing console, offline and browser-local.
 * Independent of v0.8 meal log and all external food databases.
 */
(function () {
"use strict";
const form=document.getElementById("forge-pack-form");
const result=document.getElementById("forge-pack-result");
if(!form||!result)return;
const save=document.getElementById("forge-pack-save");
const copy=document.getElementById("forge-pack-copy");
const clear=document.getElementById("forge-pack-clear");
const STORAGE="forge-pack-v1";
const fields={
 batch:"forge-pack-batch",kcal:"forge-pack-kcal",protein:"forge-pack-protein",
 carbs:"forge-pack-carbs",fat:"forge-pack-fat",riceKcal:"forge-pack-rice-kcal",
 riceProtein:"forge-pack-rice-protein",riceCarbs:"forge-pack-rice-carbs",
 riceFat:"forge-pack-rice-fat",count:"forge-pack-count",
 mix:"forge-pack-mix-serving",rice:"forge-pack-rice-serving"
};
let lastCopy="";
const input=(key)=>document.getElementById(fields[key]);
const round1=n=>Math.round((n+Number.EPSILON)*10)/10;
function read(){
 const data={};
 for(const [key] of Object.entries(fields)){
  const element=input(key);
  const str=element.value.trim();
  if(!str)throw Error("Complete every field before calculating. Zero is allowed for a nutrient but not for a required weight.");
  const n=Number(str);
  if(!Number.isFinite(n)||n<0||n>Number(element.max||Number.MAX_VALUE)||n<Number(element.min||0))throw Error("Review the highlighted weights and nutrition values; one is outside the allowed range.");
  data[key]=n;
 }
 if(!Number.isInteger(data.count))throw Error("Number of containers must be a whole number.");
 if(data.mix*data.count>data.batch+0.000001)throw Error("Not enough cooked mixture in this batch for those portions. Lower grams or container count.");
 return data;
}
function calculate(d){
 const scale=d.mix/d.batch,riceScale=d.rice/100;
 const nutrient=(k,riceK)=>round1(d[k]*scale+d[riceK]*riceScale);
 const one={
  kcal:nutrient("kcal","riceKcal"),
  protein:nutrient("protein","riceProtein"),
  carbs:nutrient("carbs","riceCarbs"),
  fat:nutrient("fat","riceFat")
 };
 const all={
  kcal:round1((d.kcal*scale+d.riceKcal*riceScale)*d.count),
  protein:round1((d.protein*scale+d.riceProtein*riceScale)*d.count),
  carbs:round1((d.carbs*scale+d.riceCarbs*riceScale)*d.count),
  fat:round1((d.fat*scale+d.riceFat*riceScale)*d.count)
 };
 return {one,all,remaining:round1(d.batch-d.count*d.mix)};
}
function showError(message){
 result.replaceChildren();
 const p=document.createElement("p");
 p.className="forge-pack-error";p.textContent=message;
 result.append(p);
 result.dataset.state="error";lastCopy="";
}
function render(d,c){
 result.replaceChildren();
 result.dataset.state="ready";
 const header=document.createElement("div");
 header.className="forge-pack-result-head";
 const heading=document.createElement("strong");
 heading.textContent=d.count+" container"+(d.count===1?"":"s")+" ready to pack";
 const note=document.createElement("span");
 note.textContent="Cooked weights · estimates";header.append(heading,note);result.append(header);
 const tiles=document.createElement("div");tiles.className="forge-pack-tiles";
 for(const [name,value,unit] of [
 ["MEAT MIXTURE",d.mix,"g / container"],["COOKED RICE",d.rice,"g / container"],
 ["ENERGY",c.one.kcal,"kcal / container"],["PROTEIN",c.one.protein,"g / container"]]){
  const box=document.createElement("div");box.className="forge-pack-tile";
  const label=document.createElement("span");label.textContent=name;
  const amount=document.createElement("strong");amount.textContent=round1(value).toLocaleString();
  const unitNode=document.createElement("small");unitNode.textContent=unit;
  box.append(label,amount,unitNode);tiles.append(box);
 }
 result.append(tiles);
 const p=document.createElement("p");p.className="forge-pack-totals";
 p.textContent="Each: "+c.one.protein+" g protein · "+c.one.carbs+" g carbs · "+c.one.fat+" g fat. "+
  "All containers: "+c.all.kcal+" kcal · "+c.all.protein+" g protein · "+c.all.carbs+" g carbs · "+c.all.fat+" g fat. "+
  "Mixture remaining: "+c.remaining+" g.";
 result.append(p);
 const warning=document.createElement("p");
 warning.className="forge-pack-footnote";
 warning.textContent="Nothing was added to your food diary. Gram amounts are cooked food weights; nutrition is only as accurate as your source batch inputs.";
 result.append(warning);
 lastCopy=d.count+" meal container"+(d.count===1?"":"s")+
  "\nEach: "+d.mix+" g cooked meat mixture + "+d.rice+" g cooked rice"+
  "\nEstimated per container: "+c.one.kcal+" kcal, "+c.one.protein+" g protein, "+c.one.carbs+" g carbs, "+c.one.fat+" g fat"+
  "\nAll containers: "+c.all.kcal+" kcal, "+c.all.protein+" g protein, "+c.all.carbs+" g carbs, "+c.all.fat+" g fat"+
  "\nCooked meat mixture remaining: "+c.remaining+" g"+
  "\nNot automatically logged. Food estimates depend on label and cooked batch measurements.";
}
function compute(){
 const d=read(),c=calculate(d);
 render(d,c);return {d,c};
}
form.addEventListener("submit",event=>{
 event.preventDefault();
 try{compute();}catch(error){showError(error.message||"Unable to calculate.");}
});
save.addEventListener("click",()=>{
 try{
  const {d}=compute();
  localStorage.setItem(STORAGE,JSON.stringify({version:1,values:d}));
  const p=document.createElement("p");
  p.className="forge-pack-saved";p.textContent="Saved on this device. Your numbers will be restored next time in this browser.";
  result.append(p);
 }catch(error){showError(error.message||"Could not save. Browser storage may be unavailable.");}
});
copy.addEventListener("click",async()=>{
 try{
  compute();
  if(!navigator.clipboard?.writeText)throw Error("Clipboard access isn't available; select and copy the calculated results instead.");
  await navigator.clipboard.writeText(lastCopy);
  const p=document.createElement("p");p.className="forge-pack-saved";p.textContent="Packing instructions copied.";
  result.append(p);
 }catch(error){showError(error.message||"Copy failed. You can select the displayed results.");}
});
clear.addEventListener("click",()=>{
 form.reset();
 for(const key of Object.keys(fields)){if(key!=="count")input(key).value="";}
 input("count").value="2";
 try{localStorage.removeItem(STORAGE);}catch{}
 result.dataset.state="empty";
 result.textContent="Packing console cleared. Enter actual cooked batch figures to calculate.";
 lastCopy="";
});
try{
 const stored=JSON.parse(localStorage.getItem(STORAGE)||"null");
 if(stored?.version===1&&stored?.values&&typeof stored.values==="object"){
  for(const key of Object.keys(fields)){
   const v=stored.values[key];
   if(typeof v==="number"&&Number.isFinite(v))input(key).value=String(v);
  }
  compute();
 }
}catch{
 result.textContent="Enter your cooked batch data. Local saved values could not be restored.";
}
})();
