/* FORGE interface behavior — local navigation only, no network or user-data access. */
(function () {
  "use strict";
  function setup() {
    const items = [...document.querySelectorAll(".tabs [data-tab]")];
    const sections = new Map(items.map(button => [button.dataset.tab, document.getElementById(button.dataset.tab)]));
    const status = document.getElementById("forge-active-section");
    const hero = document.getElementById("forge-hero");
    const back = document.getElementById("forge-back-top");
    const prefersLessMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!items.length || !status) return;

    function sync(button, updateHash) {
      const id = button.dataset.tab;
      const section = sections.get(id);
      if (!section) return;
      items.forEach(item => {
        if (item === button) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      if (hero) hero.classList.toggle("is-secondary", id !== "profile");
      const heading = section.querySelector(".section-header h2");
      status.textContent = "Current workspace: " + (heading ? heading.textContent.trim() : button.textContent.trim());
      document.title = "FORGE — " + (heading ? heading.textContent.trim() : "Fitness Foundation");
      if (updateHash && window.location.hash !== "#" + id) {
        window.history.replaceState(null, "", "#" + id);
      }
      if (window.matchMedia && window.matchMedia("(max-width: 950px)").matches) {
        button.scrollIntoView({block:"nearest",inline:"nearest",behavior:prefersLessMotion?"auto":"smooth"});
      }
    }

    items.forEach(button => {
      button.type = "button";
      button.addEventListener("click", event => {
        // The existing FORGE handler owns page switching and workout rendering.
        sync(button, true);
        if (event.detail === 0) {
          const heading = sections.get(button.dataset.tab)?.querySelector(".section-header h2");
          if (heading) {
            heading.tabIndex = -1;
            window.requestAnimationFrame(() => heading.focus({preventScroll:true}));
          }
        }
      });
    });

    document.querySelectorAll("[data-forge-go]").forEach(button => {
      button.addEventListener("click", () => {
        const target = items.find(item => item.dataset.tab === button.dataset.forgeGo);
        if (target) target.click();
      });
    });

    function routeFromHash() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = items.find(item => item.dataset.tab === id);
      if (target && !target.classList.contains("active")) target.click();
      else sync(target || items.find(item => item.classList.contains("active")) || items[0], false);
    }
    window.addEventListener("hashchange", routeFromHash);
    routeFromHash();

    if (back) {
      let lastVisible = null;
      function updateBackButton() {
        const visible = window.scrollY > 520;
        if (lastVisible !== visible) { back.hidden = !visible; lastVisible = visible; }
      }
      window.addEventListener("scroll", updateBackButton, {passive:true});
      back.addEventListener("click", () => window.scrollTo({top:0,behavior:prefersLessMotion?"auto":"smooth"}));
      updateBackButton();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, {once:true});
  else setup();
})();
