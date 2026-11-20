// Applies the chosen theme and text size before the page draws, so there's no
// flash of the wrong colors. Loaded as a plain script in <head> on every page.
// Settings live in localStorage under "pm.appearance":
//   { theme: "sand" | "oat" | "khaki" | "white" | "dark", followDark: true, text: "normal" | "large" | "larger" }
(function () {
  var THEMES = {
    sand: { name: "Sand", bar: "#566336" },
    oat: { name: "Oat", bar: "#9a4a29" },
    khaki: { name: "Khaki", bar: "#5b4636" },
    white: { name: "White", bar: "#0f5f5c" },
    dark: { name: "Dark", bar: "#1a1814" },
  };
  var DEFAULTS = { theme: "sand", followDark: true, text: "normal" };
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem("pm.appearance") || "{}");
      return {
        theme: THEMES[v.theme] ? v.theme : DEFAULTS.theme,
        followDark: typeof v.followDark === "boolean" ? v.followDark : DEFAULTS.followDark,
        text: v.text === "large" || v.text === "larger" ? v.text : "normal",
      };
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function apply(a) {
    a = a || read();
    var root = document.documentElement;
    var phoneDark = !!(darkQuery && darkQuery.matches);
    var theme = a.followDark && phoneDark ? "dark" : a.theme;
    root.setAttribute("data-theme", theme);
    if (a.text === "normal") root.removeAttribute("data-text");
    else root.setAttribute("data-text", a.text);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEMES[theme].bar);
    return theme;
  }

  function save(a) {
    try {
      localStorage.setItem("pm.appearance", JSON.stringify(a));
    } catch (e) {
      // storage blocked: the choice lasts until the page is closed
    }
    return apply(a);
  }

  apply();
  if (darkQuery) {
    var onChange = function () { apply(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener("change", onChange);
    else if (darkQuery.addListener) darkQuery.addListener(onChange);
  }

  window.pmTheme = { THEMES: THEMES, DEFAULTS: DEFAULTS, read: read, apply: apply, save: save };
})();
