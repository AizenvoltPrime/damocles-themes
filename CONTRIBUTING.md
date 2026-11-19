# Submitting a theme

Thank you for sharing a theme. A theme in this store is a `.damocles-theme` file you publish as a GitHub release asset in your
own repository; this repository only lists it, pinned by its SHA-256.

## Steps

1. Make the theme in Damocles (Settings › Appearance) and export it with Export… from its card. Give it a name, a
   description, an author, a version and a license in the theme editor's Details.
2. Publish the file as an asset of a release in a public GitHub repository you own. Do not replace that asset later: the
   store pins its exact bytes, and a changed file is refused by CI and by every app.
3. Compute its SHA-256, for example `sha256sum aurora.damocles-theme` (Linux), `shasum -a 256 aurora.damocles-theme`
   (macOS) or `Get-FileHash aurora.damocles-theme -Algorithm SHA256` (Windows; write the hash in lowercase).
4. Fork this repository and add one file, `themes/<id>.json`, where `<id>` is lowercase letters, digits and dashes, at most
   64 characters, unique in the store and equal to the file name:

   ```json
   {
     "id": "aurora",
     "version": "1.0.0",
     "author": "Your name",
     "url": "https://github.com/you/aurora-theme/releases/download/v1.0.0/aurora.damocles-theme",
     "sha256": "<64 lowercase hex characters>",
     "minAppVersion": "3.8.0"
   }
   ```

   `url` must be an https GitHub release download. `minAppVersion` is the oldest Damocles that reads your theme, as `x.y.z`.
   No other keys are accepted.
5. Open a pull request. CI downloads the file, checks its SHA-256, and runs the Damocles theme validator on it: the format,
   the archive limits, the custom CSS sanitizer, the license declarations, every asset's hash, and a flash check of every
   moving wallpaper and sprite. A theme with flashing over the WCAG 2.3.1 thresholds (more than 3 flashes in any second) is
   refused. The validator runs the app's own theme renderer under the Electron of the Damocles version `DAMOCLES_REF` names,
   so it decodes every video wallpaper the app plays (H.264, VP8, VP9 and AV1) the same way. CI uploads the 320 px
   wallpaper thumbnails it made as an artifact, so you can see what the store will show.
6. A maintainer reviews the theme and the pull request. After the merge, CI builds the entry (colors, fonts, thumbnails)
   and signs the list; apps see it on their next fetch.

To publish a new version, release a new file under a new URL, then change `version`, `url` and `sha256` (and `minAppVersion`
if needed) in your `themes/<id>.json` in a new pull request. Apps that installed the theme show an update; a user's own
edits are kept as a copy when they update.

## Content rule

- Every image, sprite and font in the theme is your own work or licensed for redistribution, and the theme declares a
  license for each one (the license fields of each asset, and the theme's own license).
- No copyrighted characters, logos or artwork without the rights holder's permission. Fan-art themes can still be shared as
  a file or a link; they are not listed here.
- Fonts with "Restricted License embedding" cannot be bundled; Damocles refuses them on export.
- No hidden or misleading text in names and descriptions.

Maintainers may decline any submission, and may remove a listed theme at any time.

## Takedown

If a listed theme uses your work without permission, or breaks the content rule, open a Takedown issue in this repository
(Issues › New issue › Takedown), naming the theme's `id` and what it uses. The form labels it `takedown`. A removed theme is
listed under `removed` with a reason; apps that have it installed switch away from it, mark it as removed from the store, and
offer to delete it.

You can also go to GitHub, which hosts this repository and the theme files:

- Copyright: GitHub's [Copyright claims form](https://github.com/contact/dmca), after its
  [guide to submitting a DMCA takedown notice](https://docs.github.com/en/site-policy/content-removal-policies/guide-to-submitting-a-dmca-takedown-notice).
  Without a GitHub account, send the notice by email to `copyright@github.com`, which that guide names.
- Trademark: GitHub's [trademark policy violation report](https://support.github.com/contact/trademark-policy), after its
  [trademark policy](https://docs.github.com/en/site-policy/content-removal-policies/github-trademark-policy). GitHub's
  support site asks you to sign in before it shows this form.

A notice to GitHub names the repository that holds the file: the theme's release repository (its `url` in
`themes/<id>.json`), this repository, or both.
