module.exports = {
  extends: "stylelint-config-standard",
  rules: {
    // The codebase spells out "rgba(...)" (not the "rgb(...)" alias) whenever
    // alpha is present, so the alpha channel is visible in the function name
    // itself rather than only in its last argument.
    "color-function-alias-notation": null,

    // This is a static site with no build step/polyfills and no documented
    // minimum-browser policy, so min-width/max-width (universal support) is
    // the right choice over the modern range syntax ("(width >= 1100px)"),
    // which older-but-still-current browsers (e.g. Safari < 16.4) don't
    // support.
    "media-feature-range-notation": null,

    // Flags selectors ordered by position rather than ascending specificity.
    // The handful of cases this repo has all involve selectors with
    // different specificities, so declaration order doesn't change which
    // rule wins - purely stylistic, not worth reordering working CSS for.
    "no-descending-specificity": null,
  },
};
