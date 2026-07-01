# Tampermonkey Scripts

Userscripts I maintain, hosted here so [Tampermonkey](https://www.tampermonkey.net/) can auto-update them.

## How auto-update works

Each script's header contains `@updateURL` and `@downloadURL` pointing at its raw
file in this repo. Tampermonkey periodically fetches the `@updateURL`, compares the
`@version`, and pulls the new copy when it's higher. To publish an update: edit the
script, **bump the `@version`**, commit, and push. Users get it automatically (or via
Tampermonkey → **Utilities → Check for userscript updates**).

## Scripts

### DocMgt Saved Search Metadata

Displays record metadata for a single DocMgt saved search. One script per saved
search, kept under [`docmgt-saved-search-metadata/`](docmgt-saved-search-metadata/).

| Saved search | Install |
|--------------|---------|
| **Delivery Only Printanista** (ID `504060`) | [Install](https://raw.githubusercontent.com/BrockDawg/Tampermonkey-Scripts/main/docmgt-saved-search-metadata/delivery-only-printanista.user.js) |

## Installing

With Tampermonkey installed, click an **Install** link above — Tampermonkey detects the
`.user.js` file and opens its install screen. Once installed, updates are automatic.
