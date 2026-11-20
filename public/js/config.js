// Where "Pin in the wrong place?" reports go. Set ONE of these:
//   githubRepo: "your-name/your-repo"  -> opens the prefilled report form on GitHub
//   email: "you@example.com"           -> opens a prefilled email
// If both are empty, the correction is copied to the clipboard instead.
// When the site is built by GitHub Actions, githubRepo is filled in automatically.
export const REPORT = {
  githubRepo: "",
  email: "",
};
