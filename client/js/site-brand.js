// Replaces per-page brand handling. Applies brand.name + footer copyright
// everywhere on the page it's loaded. Falls back gracefully.

(function () {
  const DEFAULT_BRAND = "Roland Invests";

  function applyBrand(brand, copyright) {
    document.querySelectorAll("[data-brand]").forEach(el => {
      const parts = brand.split(" ");
      if (parts.length > 1) {
        el.innerHTML = "<em>" + parts[0] + "</em> " + parts.slice(1).join(" ");
      } else {
        el.textContent = brand;
      }
    });
    document.querySelectorAll("[data-copyright]").forEach(el => {
      el.textContent = copyright || ("© 2026 " + brand);
    });
  }

  async function load() {
    let brand = DEFAULT_BRAND, copyright = null;
    try {
      const res = await fetch(window.API_BASE + "/api/content");
      if (res.ok) {
        const data = await res.json();
        if (data && data.content) {
          brand = data.content["brand.name"] || brand;
          copyright = data.content["footer.copyright"] || null;
        }
      }
    } catch (_) {}
    applyBrand(brand, copyright);
    // Late-arriving elements (e.g. dynamically rendered) can call this too
    window.__applyBrand = () => applyBrand(brand, copyright);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();