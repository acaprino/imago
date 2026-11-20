# Imago: rules for agents

- Two branches, and only two: `main` (what is released) and `develop` (where work is integrated).
- Work always on `develop`, or on a short branch from `develop` that is merged back into `develop` and then
  deleted. Never merge or push into `main`, and leave no other branch, locally or on GitHub.
- A release is the pull request `develop` → `main`, opened and merged by the owner: every merge into `main`
  is a release (`.github/workflows/release.yml`, the same release system as Shinatama, Mukade, Xiox, Muro,
  Ethel and artcraft-web).
  The version goes up by a patch, or by a minor or major step when the pull request has the label
  `release:minor` or `release:major`; `npm run verify` is the build, on Windows; the tag `v<version>` and the
  GitHub Release (no installer and no assets: an app depends on the tag) are published, and `main` is merged
  back into `develop`. Nothing is published when `npm run verify` fails.
- Never change the version or create release tags by hand: the workflow does it (`.github/release.json` lists
  the version files, `.github/scripts/release.mjs` writes them).
