// Installer scripts are bundled into the Worker as text (see "rules" in wrangler.jsonc).
declare module '*.sh' {
  const text: string;
  export default text;
}
declare module '*.ps1' {
  const text: string;
  export default text;
}
