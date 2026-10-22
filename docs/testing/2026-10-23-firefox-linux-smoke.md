# Firefox smoke in Linux Docker

On 2026-10-23 at 00:18 Asia/Shanghai, all **8 Firefox smoke tests passed in
12.0 seconds**, with zero retries, skips, unexpected failures, or flaky results.
The unchanged smoke suite exercised the real production build, including Studio
and Fluency dynamic modules and IndexedDB persistence.

| Check | Result | Test duration |
| --- | --- | ---: |
| Firefox/WebKit browser identity guard | Passed | 1,053 ms |
| Startup without console, page, request, or asset errors | Passed | 1,015 ms |
| Catalog navigation and browser Back | Passed | 771 ms |
| Real Practice submission | Passed | 799 ms |
| Immediate contraction input during Quick Start | Passed | 1,126 ms |
| Active sentence and draft recovery after reload | Passed | 1,309 ms |
| Studio recall without premature answer disclosure | Passed | 1,275 ms |
| Optional typing module and separate persisted Fluency pass | Passed | 1,651 ms |

The first check is a browser identity assertion; the other seven exercise UI
flows. The suite's automatic diagnostics fixture found no browser console,
page, request, or asset errors. `npm ci` installed 63 packages in 41 seconds;
the container's `npm run build` passed before the preview server started.

## Environment and isolation

- Official image: `mcr.microsoft.com/playwright:v1.62.1-noble`.
- Image digest: `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
- ARM64 manifest: `sha256:941cc91e5022880ac1d14ae90b476b624deb6399dbbc28d612d5d5bd7928fcbd`.
- Ubuntu 24.04.4 LTS, Linux arm64, Node v24.18.1, Playwright 1.62.1.
- Actual Firefox: **153.0**, executable `/ms-playwright/firefox-1538/firefox/firefox`.
- Docker Engine 29.4.0; Linux kernel `7.0.14-orbstack-00380-ga7e0a2dc9535`.
- `pwuser`, UID/GID 1001; effective capabilities zero, `NoNewPrivs: 1`, `Seccomp: 2`.
- Only this repository was bind-mounted, at `/source`, read-only. The container
  copied source into its private filesystem, excluded host `node_modules`, `.git`,
  `dist`, and `.env*`, and ran its own `npm ci`. No host home, credentials, Docker
  socket, or additional host directory was mounted.
- `--init`, private 1 GiB shared memory, `no-new-privileges`, and the unmodified
  official version-pinned seccomp profile were used. No privileged mode, added
  capabilities, or sandbox-disabling browser launch flags were used.

This follows the [official Playwright Docker guidance](https://playwright.dev/docs/docker),
including matching package/image versions and running as a separate user with
the seccomp profile. The
[v1.62.1 profile](https://raw.githubusercontent.com/microsoft/playwright/v1.62.1/utils/docker/seccomp_profile.json)
had SHA-256 `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`.

The native macOS 27 / Firefox r1538 startup symptom is described in
[upstream issue #42082](https://github.com/microsoft/playwright/issues/42082).
This Linux result completes Firefox application verification without changing
its sandbox settings. It does not establish that native macOS Firefox startup
has been fixed.

## Evidence and reproduction

Raw Playwright JSON, environment fingerprints and console output are retained in
this task's local verification artifacts, outside the source tree in accordance
with the repository's generated-output policy. The container exited with code 0
and was not OOM-killed. The final pull request's Linux CI supplies a separate
commit-bound verification record.

The source copy began at **00:18:09 Asia/Shanghai**. All four recorded fingerprints
match the final workspace versions checked after the run. Other submodules were
not individually fingerprinted, so this evidence does not claim a complete source
manifest or a final Git-commit attestation. Its coverage is the eight smoke checks;
the broader pause-protection and interaction scenarios belong to the separate
Chromium acceptance suite.

The temporary config inherited the existing `playwright.config.ts` and retained
only its `firefox-smoke` project. Its overrides were:

```ts
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const baseURL = "http://127.0.0.1:4196";
export default defineConfig({
  ...base,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "docker-artifacts/results.json" }]],
  outputDir: "docker-artifacts/test-results",
  use: { ...base.use, baseURL },
  projects: base.projects?.filter((project) => project.name === "firefox-smoke"),
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4196 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
```

To reproduce, save that override as
`node_modules/.cache/firefox-docker/playwright.docker.config.ts`, download the
version-pinned profile into the same directory, and run from the repository root:

```bash
docker run --rm --init --user pwuser \
  --security-opt no-new-privileges=true \
  --security-opt "seccomp=$PWD/node_modules/.cache/firefox-docker/seccomp_profile.json" \
  --shm-size=1g \
  --mount "type=bind,source=$PWD,target=/source,readonly" \
  --workdir /home/pwuser --env CI=1 --env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  mcr.microsoft.com/playwright:v1.62.1-noble /bin/bash -lc '
    set -euo pipefail
    mkdir -p /home/pwuser/utterloop-run
    tar -C /source --exclude="./node_modules" --exclude="./.git" --exclude="./dist" --exclude="./.env" --exclude="./.env.*" -cf - . | tar -C /home/pwuser/utterloop-run -xf -
    cd /home/pwuser/utterloop-run
    cp /source/node_modules/.cache/firefox-docker/playwright.docker.config.ts .
    npm ci --cache /home/pwuser/.cache/utterloop-npm --no-audit --no-fund
    npx playwright test --config playwright.docker.config.ts
  '
```

The first image pull took approximately 13 minutes; the test run itself took
12 seconds. After copying the evidence, the container, its installed dependencies,
temporary scripts/profile, and the newly pulled image were removed. No application
source, existing test, or existing configuration was modified for this run.
