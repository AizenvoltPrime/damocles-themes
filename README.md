# Damocles community themes

The community theme store of the [Damocles](https://github.com/AizenvoltPrime/damocles) desktop app. The app's
Settings › Appearance › Browse tab lists the themes here, drawn from their own colors, and installs them through the same
install card as a theme file or link.

## How the app trusts this list

- `community.json` is the source. CI builds each entry from a submission under `themes/` and writes `community.signed.json`,
  signed with an Ed25519 key held in the `store-signing` environment. The app refuses an unsigned or wrongly signed list, one
  signed by a key it does not know, a list older (by `sequence`) than one it already saw, and an expired one.
- Each entry pins its theme file by size and SHA-256. The app downloads the file only from a GitHub release host and refuses
  bytes that differ from the pin before it reads them.
- `removed` takes a theme out of the store. An app that has it installed switches its looks back to the built-in theme,
  marks it "Removed from the store" with the reason, and offers Delete. Nothing is deleted on its own.
- The app fetches the list when you open Browse or press Check for updates, and, while you have a store theme installed,
  beside its own update check: the automatic checks under "Check for updates automatically", and Help › Check for Updates…
  or About's check when you choose them. The setting "Community store" turns all of it off.
- CI validates each theme with the app's own theme renderer, under the Electron of the Damocles version `DAMOCLES_REF`
  names, so the store accepts exactly the wallpapers the app plays.

## Contents

| Path | What it is |
| --- | --- |
| `themes/<id>.json` | One submission per theme: `id`, `version`, `author`, `url`, `sha256`, `minAppVersion` |
| `community.json` | The list's source: `sequence`, the built `entries`, and `removed`, edited by hand |
| `community.signed.json` | The signed list the app reads, written by CI only |
| `thumbs/<sha256>.webp` | 320 px wallpaper thumbnails the validator made, written by CI only |
| `scripts/build-community.mjs` | Downloads each submitted file, checks its SHA-256 and runs the Damocles validator |
| `scripts/sign.mjs` | Signs `community.json` into `community.signed.json` with `node:crypto` |
| `DAMOCLES_REF` | The Damocles ref whose validator CI builds |
| `.github/workflows/validate.yml` | Pull requests: validates the changed submissions, with no secret and read-only access |
| `.github/workflows/publish.yml` | Pushes to `main` build, then sign; the 1st and 15th and a `resign-only` run re-sign the committed list; all behind `store-signing` |
| `.github/ISSUE_TEMPLATE/takedown.yml` | The Takedown issue form, which labels the issue `takedown` |
| `.github/ISSUE_TEMPLATE/config.yml` | Links beside it to GitHub's own copyright and trademark reports |

To submit a theme, see [CONTRIBUTING.md](CONTRIBUTING.md). To ask for a theme to be taken down, open a Takedown issue
(Issues › New issue › Takedown), or report it to GitHub as [CONTRIBUTING.md](CONTRIBUTING.md#takedown) describes.

## Maintainers

- The `store-signing` environment holds `STORE_SIGNING_KEY` (the PKCS#8 PEM of the private key) and requires the owner's
  review. Limit its deployment branches to `main` (Settings › Environments › store-signing › Deployment branches), so no
  other branch's workflow can reach the key.
- The first signed list: after the first push, run "Publish the store list" by hand with `resign-only` checked. It signs the
  committed empty `community.json` without building, so it works before the validator is on Damocles' `main`. The scheduled
  re-signs on the 1st and 15th skip the build too and keep the 30-day `expiresAt` from lapsing.
- Create the `takedown` label once (Issues › Labels); the Takedown issue form applies it, since reporters cannot set labels.
- Each sign raises `sequence` by one and writes it back to `community.json`.
- To take a theme down, add `{ "id", "reason" }` to `removed` (with `sha256` or `version` to name one file or version only),
  remove its `themes/<id>.json`, and push. The reason is shown to users as written.
- `DAMOCLES_REF` is `main` until the first Damocles release that contains the validator (`npm run build:theme-validator`);
  set it to that release tag then. Until the validator is on the ref it names, validation and publishing of submissions fail.
- The sign job pushes `community.signed.json` and `thumbs/` with the workflow's token. Branch protection that requires pull
  requests on `main` would refuse that push.

## License

The scripts, workflows and documentation are MIT licensed ([LICENSE](LICENSE)). Each theme carries its own license, with a
license for every image and font it bundles.
