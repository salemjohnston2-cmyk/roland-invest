// Sets document title and meta description from site content.
// Falls back to a neutral default if /api/content isn't ready yet.

(function () {
  const DEFAULT_BRAND = "Roland Invests";

  async function applyMeta(pageLabel) {
    let brand = DEFAULT_BRAND;
    try {
      const res = await fetch(window.API_BASE + "/api/content");
      if (res.ok) {
        const data = await res.json();
        if (data && data.content && data.content["brand.name"]) {
          brand = data.content["brand.name"];
        }
      }
    } catch (_) { /* fall through to default */ }

    const title = pageLabel ? pageLabel + " — " + brand : brand;
    document.title = title;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", pageLabel ? pageLabel + " on " + brand : brand);
  }

  window.applySiteMeta = applyMeta;
})();