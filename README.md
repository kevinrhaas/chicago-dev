# chicago-dev

The dev preview of [kevinrhaas/chicago](https://github.com/kevinrhaas/chicago), served at
**https://dev.chicago.polecat.live/4d/dev/**.

This repository holds no app code. `.github/workflows/deploy-dev-preview.yml` clones
kevinrhaas/chicago at `dev`, runs `chicago/4d/tools/publish.sh`, marks the result as a
preview (banner, `noindex`, build stamp), and deploys it as this repository's GitHub
Pages site.

It has its own Pages site so the preview has its own 1 GB, separate from production at
https://chicago.polecat.live/4d/ (split 2026-11-13).

Runs when kevinrhaas/chicago's deploy workflow dispatches it after a push to `dev`, and
every 15 minutes as a fallback (a scheduled run does nothing if the preview already
shows dev's head). Run it by hand from the Actions tab at any time.
