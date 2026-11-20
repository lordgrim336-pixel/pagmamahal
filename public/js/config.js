// Where "Pin in the wrong place?" reports go, in order of preference:
//   endpoint + turnstileSiteKey -> one-tap, no sign-in (the Cloudflare relay in relay/)
//   githubRepo                  -> opens the pre-filled report form on GitHub (needs an account)
//   email                       -> opens a pre-filled email
// If none is set, the report is copied to the clipboard instead.
export const REPORT = {
  endpoint: "",
  turnstileSiteKey: "",
  githubRepo: "lordgrim336-pixel/pagmamahal",
  email: "",
};
