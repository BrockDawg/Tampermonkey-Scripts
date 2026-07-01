# Tampermonkey Scripts

Userscripts I maintain, hosted here so [Tampermonkey](https://www.tampermonkey.net/) can auto-update them.

## How auto-update works

Each script's header contains `@updateURL` and `@downloadURL` pointing at its raw
file in this repo. Tampermonkey periodically fetches the `@updateURL`, compares the
`@version`, and pulls the new copy when it's higher. To publish an update: edit the
script, **bump the `@version`**, commit, and push. Users get it automatically (or via
Tampermonkey → **Utilities → Check for userscript updates**).

## Scripts

| Script | Description | Install |
|--------|-------------|---------|
| **DocMgt Saved Search Metadata** | Displays record metadata for one DocMgt saved search | [Install](https://raw.githubusercontent.com/BrockDawg/Tampermonkey-Scripts/main/docmgt-saved-search-metadata.user.js) |

## Installing

With Tampermonkey installed, click an **Install** link above — Tampermonkey detects the
`.user.js` file and opens its install screen. Once installed, updates are automatic.
