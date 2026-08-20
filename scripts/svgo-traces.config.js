/* SVGO config for assets/traces — run as:
 *
 *   npx svgo --config scripts/svgo-traces.config.js -f assets/traces
 *
 * Plain `npx svgo -f assets/traces` will LOOK like it worked and quietly
 * undo the ground-line tuning. By default SVGO bakes a group's transform
 * into its children's path coordinates and deletes the group. The
 * rendering is identical, so nothing appears broken — but the one number
 * that positions a cairn on the shared ground line disappears into
 * six-decimal path data, and re-tuning stops being an edit and becomes a
 * full re-measure through scripts/normalize-cairns.html.
 *
 * Three of the seven tiers carry a real transform (faint, small, sacred);
 * the other four needed none. js/traces-svg.test.js measures the rendered
 * result rather than trusting this file.
 */

module.exports = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          collapseGroups: false,
          moveGroupAttrsToElems: false,
          convertPathData: { applyTransforms: false },
          convertTransform: { collapseIntoOne: false }
        }
      }
    }
  ]
};
