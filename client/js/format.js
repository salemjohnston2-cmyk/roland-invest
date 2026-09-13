// Shared formatting helpers. No emojis, no slop.

window.fmt = {
  currency(n) {
    const v = Number(n) || 0;
    return "₦" + v.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  },

  percent(n) {
    const v = Number(n) || 0;
    const sign = v >= 0 ? "+" : "";
    return sign + v.toFixed(2) + "%";
  },

  arrow(n) {
    // SVG-less text arrow for tight spots; page-level icons are SVG.
    return Number(n) >= 0 ? "▲" : "▼";
  },

  date(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("en-NG", {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  },

  shortDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-NG", {
      year: "numeric", month: "short", day: "2-digit",
    });
  },
};