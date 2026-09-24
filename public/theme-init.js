(function () {
  var t = "system";
  try {
    t = window.localStorage.getItem("theme") || "system";
  } catch (e) {
    /* storage blocked (e.g. private mode) — fall back to system theme */
  }
  var dark = t === "dark";
  if (t === "system") {
    try {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e) {
      dark = false;
    }
  }
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0e1116" : "#f4f6f8");
})();
