# AuraOSProxy1

A lightweight proxy UI and web app launcher built on a single-page `index.html` frontend with Ultraviolet proxy support.

## Overview

- `index.html` is the main landing page and search interface.
- `app/` contains the proxy UI assets, tab shell, games, and support scripts.
- `app/uv/` contains Ultraviolet proxy bundle, handler, config, and service worker files.

## Run locally

- This repo is configured for Replit via `.replit`.
- Locally, open `index.html` in a browser or run the hosted frontend with a local static server.

Example:

```bash
npm run start
```

## Notes

- Search functionality is implemented in `index.html` and routes queries through the proxy config when available.
- `app/tabs.html` provides a tabbed browsing shell with iframe navigation.

## Additional documentation

- See `app/README.md` for app-specific features and deployment links.
