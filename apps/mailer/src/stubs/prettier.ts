// @react-email/render imports prettier at module load but only calls it for render(..., { pretty: true }),
// which Flaresend never uses. wrangler.jsonc aliases prettier to this stub to keep it out of the bundle.
export function format(): never {
  throw new Error("prettier is not bundled; do not use render(..., { pretty: true })");
}
export default {};
