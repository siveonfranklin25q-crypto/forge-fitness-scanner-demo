/* FORGE immersive UX — local only, no network, telemetry or profile upload. */
(function () {
  "use strict";
  function setup() {
    const hero=document.getElementById("forge-hero");
    const sidebar=document.getElementById("forge-sidebar");
    const shade=document.getElementById("forge-drawer-shade");
    const more=document.getElementById("forge-dock-more");
    const dock=document.getElementById("forge-mobile-dock");
    const motion=document.getElementById("forge-motion-toggle");
    const figure=document.querySelector(".forge-holo-panel:not(.forge-avatar-panel)");
    const mission=document.getElementById("forge-mission-headline");
    const missionDetail=document.getElementById("forge-mission-caption");
    const summary=document.getElementById("summary");
    const nav=document.querySelector(".tabs");
    if(!hero||!sidebar||!nav||!dock||!more||!shade||!mission||!missionDetail)return;

    const reduced=window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):{matches:false};
    const desktop=window.matchMedia?window.matchMedia("(min-width: 951px)"):{matches:false};
    let enabled=!reduced.matches;
    function applyMotion(){
      hero.classList.toggle("forge-still",!enabled);
      if(motion){
        motion.setAttribute("aria-pressed",String(enabled));
        motion.textContent=enabled?"Motion ON":"Motion OFF";
        motion.title=enabled?"Pause decorative animation":"Resume decorative animation";
      }
      if(!enabled&&figure){
        figure.style.setProperty("--forge-tilt-x","0deg");
        figure.style.setProperty("--forge-tilt-y","0deg");
      }
    }
    if(motion){motion.addEventListener("click",()=>{enabled=!enabled;applyMotion();});applyMotion();}

    function closeDrawer(returnFocus){
      sidebar.classList.remove("forge-drawer-open");
      shade.hidden=true;
      more.setAttribute("aria-expanded","false");
      document.body.classList.remove("forge-drawer-locked");
      if(returnFocus)more.focus();
    }
    function openDrawer(){
      sidebar.classList.add("forge-drawer-open");
      shade.hidden=false;
      more.setAttribute("aria-expanded","true");
      document.body.classList.add("forge-drawer-locked");
      const current=sidebar.querySelector(".tab.active");
      (current||sidebar.querySelector(".tab"))?.focus();
    }
    more.addEventListener("click",()=>{
      if(sidebar.classList.contains("forge-drawer-open"))closeDrawer(true);
      else openDrawer();
    });
    shade.addEventListener("click",()=>closeDrawer(true));
    sidebar.querySelectorAll("[data-tab]").forEach(item=>item.addEventListener("click",()=>closeDrawer(false)));
    dock.querySelectorAll("[data-forge-go]").forEach(item=>item.addEventListener("click",()=>closeDrawer(false)));
    document.addEventListener("keydown",event=>{
      if(event.key==="Escape"&&sidebar.classList.contains("forge-drawer-open"))closeDrawer(true);
      if(event.key==="Tab"&&sidebar.classList.contains("forge-drawer-open")){
        const options=[...sidebar.querySelectorAll("button:not([disabled])")];
        const first=options[0],last=options[options.length-1];
        if(!first||!last)return;
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });

    function syncDock(){
      const active=sidebar.querySelector("[data-tab].active")?.dataset.tab||"profile";
      dock.querySelectorAll("[data-forge-go]").forEach(item=>{
        const selected=item.dataset.forgeGo===active;
        item.classList.toggle("is-current",selected);
        if(selected)item.setAttribute("aria-current","page");
        else item.removeAttribute("aria-current");
      });
      more.classList.toggle("is-current",!dock.querySelector('[data-forge-go="'+active+'"]'));
    }
    const navObserver=new MutationObserver(syncDock);
    navObserver.observe(nav,{subtree:true,attributes:true,attributeFilter:["class"]});
    syncDock();

    function updateMomentum(profile,isSample){
      const ring=document.getElementById("forge-momentum-ring"),
            pct=document.getElementById("forge-momentum-percent"),
            count=document.getElementById("forge-momentum-count"),
            heading=document.getElementById("forge-momentum-title"),
            caption=document.getElementById("forge-momentum-caption"),
            days=document.getElementById("forge-momentum-days");
      if(!ring||!pct||!count||!heading||!caption||!days)return;
      let sessions=[];
      try{const x=JSON.parse(localStorage.getItem("forge-strength-v08-sessions")||"[]");if(Array.isArray(x))sessions=x;}catch(_){}
      const ds=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
      const today=new Date();today.setHours(12,0,0,0);
      const recent=Array.from({length:7},(_,i)=>{const date=new Date(today);date.setDate(date.getDate()+i-6);return {iso:ds(date),label:date.toLocaleDateString(undefined,{weekday:"short"}).slice(0,2)};});
      const logged=new Set(sessions.filter(s=>s&&typeof s.date==="string"&&Array.isArray(s.sets)&&s.sets.some(x=>x.type==="working")).map(s=>s.date));
      const completed=recent.filter(d=>logged.has(d.iso)).length;
      const goal=Number(profile?.days),validGoal=!isSample&&Number.isInteger(goal)&&goal>=1&&goal<=7;
      const n=validGoal?Math.min(100,Math.round(completed/goal*100)):0;
      ring.style.setProperty("--momentum",n+"%");
      pct.textContent=validGoal?n+"%":"—";
      count.textContent=validGoal?completed+" / "+goal:String(completed);
      heading.textContent=isSample?"Make this your training story":completed===0?"One real session begins the momentum":validGoal&&completed>=goal?"Weekly training goal logged":"Your consistency is taking shape";
      caption.textContent=isSample?"Set your real training days in your profile. Only dated strength sessions count.":completed===0?"No dated strength sessions in the last seven days. Record what you actually complete.":validGoal&&completed>=goal?"Your chosen weekly count is reached. Recovery and rest are part of the plan.":"Only completed working-set days recorded in Strength Tracker count, not assumed activity.";
      days.replaceChildren();
      for(const d of recent){
        const node=document.createElement("span");
        node.className="forge-momentum-day"+(logged.has(d.iso)?" logged":"");
        node.textContent=d.label;
        node.title=d.iso+(logged.has(d.iso)?" — logged":" — no dated strength log");
        days.appendChild(node);
      }
      days.setAttribute("aria-label",completed+" logged strength-training days in the last 7 days");
    }

    function updateMission(){
      let profile,workoutsDone=0,weighins=0;
      try {
        const data=JSON.parse(localStorage.getItem("forge-demo-v01")||"null");
        if(data&&typeof data==="object"){
          profile=data.profile;
          workoutsDone=Number.isFinite(Number(data.workoutsDone))?Number(data.workoutsDone):0;
          weighins=Array.isArray(data.weighins)?data.weighins.length:0;
        }
      }catch(_){/* Use neutral copy if browser storage is blocked. */}
      const isSample=!profile||(Number(profile.weight)===300&&Number(profile.age)===35&&Number(profile.referenceWeight)===220&&profile.goal==="lose"&&!weighins&&!workoutsDone);
      if(isSample){
        mission.textContent="Make the foundation yours";
        missionDetail.textContent="A sample profile is showing. Set your real goals before trusting the estimates.";
      }else if(!weighins){
        mission.textContent="Log your first check-in";
        missionDetail.textContent="Your plan is saved on this device. Add a weigh-in to start a trend.";
      }else if(!workoutsDone){
        mission.textContent="Put the plan into motion";
        missionDetail.textContent="Your profile and weigh-in are saved. Record a real workout next.";
      }else{
        mission.textContent="Keep building the evidence";
        missionDetail.textContent="You've logged progress here. Review your trends and plan the next session.";
      }
      updateMomentum(profile,isSample);
    }
    if(summary){
      const observer=new MutationObserver(updateMission);
      observer.observe(summary,{childList:true,subtree:true});
    }
    updateMission();

    if(figure&&desktop.matches&&!reduced.matches){
      let frame=null;
      figure.addEventListener("pointermove",event=>{
        if(!enabled||event.pointerType==="touch")return;
        const bounds=figure.getBoundingClientRect();
        const x=((event.clientX-bounds.left)/bounds.width-.5)*2;
        const y=((event.clientY-bounds.top)/bounds.height-.5)*2;
        if(frame!==null)cancelAnimationFrame(frame);
        frame=requestAnimationFrame(()=>{
          figure.style.setProperty("--forge-tilt-x",(-y*3.5).toFixed(2)+"deg");
          figure.style.setProperty("--forge-tilt-y",(x*5).toFixed(2)+"deg");
          frame=null;
        });
      },{passive:true});
      figure.addEventListener("pointerleave",()=>{
        if(frame!==null)cancelAnimationFrame(frame);
        frame=null;
        figure.style.setProperty("--forge-tilt-x","0deg");
        figure.style.setProperty("--forge-tilt-y","0deg");
      });
    }
    window.addEventListener("resize",()=>{
      if(window.innerWidth>780&&sidebar.classList.contains("forge-drawer-open"))closeDrawer(false);
    },{passive:true});
    if(reduced.addEventListener)reduced.addEventListener("change",event=>{enabled=!event.matches;applyMotion();});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();
