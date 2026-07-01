// ==UserScript==
// @name         DocMgt Saved Search Metadata - Delivery Only Printanista
// @namespace    eakes-docmgt
// @version      2.1.2
// @description  Displays record metadata for one DocMgt saved search
// @match        https://eakes.docmgt.cloud/V4/*
// @updateURL    https://raw.githubusercontent.com/BrockDawg/Tampermonkey-Scripts/main/docmgt-saved-search-metadata/delivery-only-printanista.user.js
// @downloadURL  https://raw.githubusercontent.com/BrockDawg/Tampermonkey-Scripts/main/docmgt-saved-search-metadata/delivery-only-printanista.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_SAVED_SEARCH_ID = '504060';

    const COLUMN_TITLE = 'Local Metadata';

    const SHOW_RECORD_ID = false;
    const SHOW_CREATED_DATE = true;
    const SHOW_CHANGED_DATE = false;
    const SHOW_WORKFLOW_ID = false;

    const capturedResponses = [];

    let renderTimer = null;
    let vueInspectionInProgress = false;

    function normalize(value) {
        return String(value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function isObject(value) {
        return (
            value !== null &&
            typeof value === 'object'
        );
    }

    function isRecordSearchUrl(url) {
        return /\/V4API\/RecordSearch/i.test(String(url || ''));
    }

    function formatDocMgtDate(value) {
        if (!value) {
            return '';
        }

        if (value instanceof Date) {
            return formatLocalDate(value);
        }

        const stringValue = String(value);

        const dotNetMatch = stringValue.match(
            /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//
        );

        if (dotNetMatch) {
            const milliseconds = Number(dotNetMatch[1]);

            if (Number.isFinite(milliseconds)) {
                return formatLocalDate(new Date(milliseconds));
            }
        }

        const parsedDate = new Date(stringValue);

        if (!Number.isNaN(parsedDate.getTime())) {
            return formatLocalDate(parsedDate);
        }

        return stringValue;
    }

    function formatLocalDate(date) {
        if (
            !(date instanceof Date) ||
            Number.isNaN(date.getTime())
        ) {
            return '';
        }

        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function isTargetSearchActive() {
        const targetID = String(TARGET_SAVED_SEARCH_ID);
        const targetPath = `/v4/search/${targetID}`.toLowerCase();

        if (
            location.pathname
                .toLowerCase()
                .includes(targetPath)
        ) {
            return true;
        }

        const targetLinks = Array.from(
            document.querySelectorAll(
                `a[href*="/V4/search/${targetID}"], ` +
                `a[href*="/v4/search/${targetID}"]`
            )
        );

        const activeDesktopLink = targetLinks.some(link => {
            return Boolean(
                link.classList.contains('active') ||
                link.closest('.nav-link.active') ||
                link.closest('.nav-item')?.querySelector('.nav-link.active')
            );
        });

        if (activeDesktopLink) {
            return true;
        }

        const selects = Array.from(
            document.querySelectorAll('select')
        );

        const activeMobileSearch = selects.some(select => {
            const hasTargetOption = Array.from(select.options).some(
                option => String(option.value) === targetID
            );

            return (
                hasTargetOption &&
                String(select.value) === targetID
            );
        });

        return activeMobileSearch;
    }

    function storeCapturedResponse(payload, sourceUrl) {
        if (!isObject(payload)) {
            return;
        }

        capturedResponses.push({
            sourceUrl: String(sourceUrl || ''),
            payload,
            capturedAt: Date.now()
        });

        if (capturedResponses.length > 250) {
            capturedResponses.splice(
                0,
                capturedResponses.length - 250
            );
        }

        scheduleRender();
    }

    function parseResponseText(text, sourceUrl) {
        if (
            !text ||
            typeof text !== 'string'
        ) {
            return;
        }

        const trimmed = text.trim();

        if (
            !trimmed.startsWith('{') &&
            !trimmed.startsWith('[')
        ) {
            return;
        }

        try {
            storeCapturedResponse(
                JSON.parse(trimmed),
                sourceUrl
            );
        } catch {
        }
    }

    const originalFetch = window.fetch;

    if (typeof originalFetch === 'function') {
        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);

            try {
                const clone = response.clone();

                const sourceUrl =
                    typeof args[0] === 'string'
                        ? args[0]
                        : args[0]?.url || response.url;

                clone.text()
                    .then(text => {
                        parseResponseText(text, sourceUrl);
                    })
                    .catch(() => {
                    });
            } catch (error) {
                console.debug(
                    'DocMgt metadata: unable to inspect fetch response.',
                    error
                );
            }

            return response;
        };
    }

    const originalXhrOpen =
        XMLHttpRequest.prototype.open;

    const originalXhrSend =
        XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
        method,
        url
    ) {
        this.__dmMetadataUrl = String(url || '');

        return originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
            try {
                if (
                    this.responseType === 'json' &&
                    this.response
                ) {
                    storeCapturedResponse(
                        this.response,
                        this.__dmMetadataUrl
                    );

                    return;
                }

                if (
                    this.responseType === '' ||
                    this.responseType === 'text'
                ) {
                    parseResponseText(
                        this.responseText,
                        this.__dmMetadataUrl
                    );
                }
            } catch (error) {
                console.debug(
                    'DocMgt metadata: unable to inspect XHR response.',
                    error
                );
            }
        });

        return originalXhrSend.apply(this, arguments);
    };

    function looksLikeRecord(record) {
        return Boolean(
            isObject(record) &&
            Array.isArray(record.Data) &&
            (
                record.ID !== undefined ||
                record.RecordID !== undefined
            )
        );
    }

    function extractRecordsFromPayload(payload) {
        const records = [];
        const seen = new Set();

        function addRecord(record) {
            if (!looksLikeRecord(record)) {
                return;
            }

            const recordID =
                record.ID ??
                record.RecordID ??
                '';

            const key =
                `${recordID}|${record.CreatedDate || ''}|` +
                `${record.ChangedDate || ''}`;

            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            records.push(record);
        }

        if (!isObject(payload)) {
            return records;
        }

        if (Array.isArray(payload.Results)) {
            payload.Results.forEach(addRecord);
        }

        addRecord(payload);

        Object.values(payload).forEach(value => {
            if (!isObject(value)) {
                return;
            }

            if (Array.isArray(value.Results)) {
                value.Results.forEach(addRecord);
            }
        });

        return records;
    }

    function getAllCapturedRecords() {
        const records = [];
        const seen = new Set();

        const responses = [...capturedResponses].reverse();

        responses.forEach(response => {
            extractRecordsFromPayload(
                response.payload
            ).forEach(record => {
                const recordID =
                    record.ID ??
                    record.RecordID ??
                    '';

                const key =
                    `${recordID}|${record.CreatedDate || ''}|` +
                    `${record.ChangedDate || ''}`;

                if (seen.has(key)) {
                    return;
                }

                seen.add(key);

                records.push({
                    record,
                    sourceUrl: response.sourceUrl,
                    capturedAt: response.capturedAt
                });
            });
        });

        return records;
    }

    function getGridHeaderRow(grid) {
        return grid.querySelector(
            '.dm-grid-header.dm-search-header'
        );
    }

    function getGridRows(grid) {
        return Array.from(
            grid.querySelectorAll(
                '.row.dm-grid-row.actionCursor'
            )
        );
    }

    function getGridHeaders(grid) {
        const headerRow = getGridHeaderRow(grid);

        if (!headerRow) {
            return [];
        }

        return Array.from(headerRow.children)
            .filter(element => {
                return !element.classList.contains(
                    'dm-local-metadata-header'
                );
            })
            .map(element => {
                return normalize(
                    element.getAttribute('title') ||
                    element.textContent
                );
            });
    }

    function getGridRowValues(row) {
        return Array.from(row.children)
            .filter(element => {
                return !element.classList.contains(
                    'dm-local-metadata-cell'
                );
            })
            .map(cell => {
                const valueElement = cell.querySelector(
                    'span[contenteditable="false"]'
                );

                return normalize(
                    valueElement?.getAttribute('title') ||
                    valueElement?.textContent ||
                    ''
                );
            });
    }

    function buildRecordSearchText(record) {
        const values = [];

        function addValue(value) {
            if (
                value === null ||
                value === undefined
            ) {
                return;
            }

            if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
            ) {
                values.push(String(value));
            }
        }

        addValue(record.ID);
        addValue(record.RecordID);

        if (Array.isArray(record.Data)) {
            record.Data.forEach(dataItem => {
                if (!isObject(dataItem)) {
                    return;
                }

                addValue(dataItem.DataValue);
                addValue(dataItem.DataValueOrig);
                addValue(dataItem.DisplayValue);
                addValue(dataItem.FieldName);
                addValue(dataItem.Name);
                addValue(dataItem.RecordID);
            });
        }

        return normalize(values.join(' | '));
    }

    function findMatchingRecord(headers, values) {
        const rowEntries = values
            .map((value, index) => ({
                header: headers[index] || '',
                value: normalize(value)
            }))
            .filter(entry => {
                return (
                    entry.value &&
                    entry.value.length >= 2
                );
            });

        const accountEntry = rowEntries.find(entry => {
            return entry.header.includes(
                'account number'
            );
        });

        const customerEntry = rowEntries.find(entry => {
            return entry.header.includes(
                'customer'
            );
        });

        const capturedRecords = getAllCapturedRecords();

        let bestMatch = null;
        let bestScore = 0;

        for (const candidate of capturedRecords) {
            const record = candidate.record;
            const recordText =
                buildRecordSearchText(record);

            let score = 0;

            if (isRecordSearchUrl(candidate.sourceUrl)) {
                score += 50;
            }

            if (
                record.ID !== undefined &&
                Array.isArray(record.Data)
            ) {
                score += 30;
            }

            if (record.CreatedDate) {
                score += 10;
            }

            if (record.ChangedDate) {
                score += 10;
            }

            if (
                accountEntry &&
                recordText.includes(accountEntry.value)
            ) {
                score += 100;
            }

            if (
                customerEntry &&
                recordText.includes(customerEntry.value)
            ) {
                score += 50;
            }

            rowEntries.forEach(entry => {
                if (
                    entry.value.length >= 3 &&
                    recordText.includes(entry.value)
                ) {
                    score += 3;
                }
            });

            if (score > bestScore) {
                bestScore = score;
                bestMatch = candidate;
            }
        }

        return bestScore >= 80
            ? bestMatch
            : null;
    }

    function extractRecordMetadata(candidate) {
        const record = candidate?.record;

        if (!record) {
            return [];
        }

        const metadata = [];

        const recordID =
            record.ID ??
            record.RecordID;

        if (
            SHOW_RECORD_ID &&
            recordID !== null &&
            recordID !== undefined &&
            String(recordID) !== ''
        ) {
            metadata.push({
                label: 'Record ID',
                title: 'Record.ID',
                value: String(recordID)
            });
        }

        if (
            SHOW_CREATED_DATE &&
            record.CreatedDate
        ) {
            metadata.push({
                label: 'Created',
                title: 'Record.CreatedDate',
                value: formatDocMgtDate(
                    record.CreatedDate
                )
            });
        }

        if (
            SHOW_CHANGED_DATE &&
            record.ChangedDate
        ) {
            metadata.push({
                label: 'Last Changed',
                title: 'Record.ChangedDate',
                value: formatDocMgtDate(
                    record.ChangedDate
                )
            });
        }

        const workflowID =
            record.ViewProperties?.WorkflowCurrentID ??
            record.ViewProperties?._WorkflowCurrentID;

        if (
            SHOW_WORKFLOW_ID &&
            workflowID !== null &&
            workflowID !== undefined &&
            String(workflowID) !== '' &&
            String(workflowID) !== '0'
        ) {
            metadata.push({
                label: 'Workflow ID',
                title:
                    'Record.ViewProperties.WorkflowCurrentID',
                value: String(workflowID)
            });
        }

        return metadata;
    }

    function ensureMetadataHeader(grid) {
        const headerRow = getGridHeaderRow(grid);

        if (!headerRow) {
            return;
        }

        if (
            headerRow.querySelector(
                '.dm-local-metadata-header'
            )
        ) {
            return;
        }

        const headerCell =
            document.createElement('div');

        headerCell.className =
            'actionCursor d-flex justify-content-between ' +
            'col nowrap dm-local-metadata-header';

        headerCell.title = COLUMN_TITLE;

        Object.assign(headerCell.style, {
            minWidth: '145px',
            flexBasis: '145px',
            maxWidth: '165px',
            background: '#000000',
            fontSize: '10px',
            fontWeight: '700',
            lineHeight: '1.2',
            borderLeft: '1px solid #cbd5e1',
            paddingLeft: '4px',
            paddingRight: '4px'
        });

        headerCell.innerHTML =
            `<div class="text-truncate">` +
            `${escapeHtml(COLUMN_TITLE)}` +
            `</div>`;

        headerRow.appendChild(headerCell);
    }

    function ensureMetadataCell(row) {
        let cell = row.querySelector(
            '.dm-local-metadata-cell'
        );

        if (cell) {
            return cell;
        }

        cell = document.createElement('div');

        cell.className =
            'pt-1 pb-1 col dm-local-metadata-cell';

        Object.assign(cell.style, {
            minWidth: '145px',
            flexBasis: '145px',
            maxWidth: '165px',
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            fontSize: '9.5px',
            lineHeight: '1.25',
            background: '#f8fafc',
            borderLeft: '1px solid #cbd5e1',
            paddingLeft: '4px',
            paddingRight: '4px'
        });

        cell.style.setProperty('color', '#000000', 'important');

        row.appendChild(cell);

        return cell;
    }

    function removeInjectedMetadata() {
        document
            .querySelectorAll(
                '.dm-local-metadata-header, ' +
                '.dm-local-metadata-cell'
            )
            .forEach(element => {
                element.remove();
            });
    }

    function renderMetadataItem(item) {
        return (
            `<div title="${escapeHtml(item.title)}">` +
            `<strong>${escapeHtml(item.label)}:</strong> ` +
            `${escapeHtml(item.value)}` +
            `</div>`
        );
    }

    function renderMetadata() {
        if (!isTargetSearchActive()) {
            removeInjectedMetadata();
            return;
        }

        const grids = document.querySelectorAll(
            '.dm-grid-table'
        );

        grids.forEach(grid => {
            const rows = getGridRows(grid);

            if (!rows.length) {
                return;
            }

            const headers = getGridHeaders(grid);

            ensureMetadataHeader(grid);

            rows.forEach(row => {
                const cell = ensureMetadataCell(row);
                const values = getGridRowValues(row);

                const candidate = findMatchingRecord(
                    headers,
                    values
                );

                if (!candidate) {
                    cell.innerHTML =
                        '<strong>Script active</strong><br>' +
                        '<span style="color:#7c2d12;">' +
                        'No matching RecordSearch data captured.' +
                        '</span>';

                    return;
                }

                const metadata =
                    extractRecordMetadata(candidate);

                if (!metadata.length) {
                    cell.innerHTML =
                        '<strong>Record matched</strong><br>' +
                        '<span style="color:#64748b;">' +
                        'No selected metadata values were returned.' +
                        '</span>';

                    return;
                }

                cell.innerHTML = metadata
                    .map(renderMetadataItem)
                    .join('');
            });
        });
    }

    function inspectVueState() {
        if (
            vueInspectionInProgress ||
            !isTargetSearchActive()
        ) {
            return;
        }

        vueInspectionInProgress = true;

        try {
            document
                .querySelectorAll('.dm-grid-table')
                .forEach(grid => {
                    let element = grid;

                    while (element) {
                        const component =
                            element.__vueParentComponent ||
                            element.__vue__;

                        if (component) {
                            const possibleSources = [
                                component.props,
                                component.data,
                                component.setupState
                            ];

                            possibleSources.forEach(source => {
                                if (isObject(source)) {
                                    storeCapturedResponse(
                                        source,
                                        'Vue component state'
                                    );
                                }
                            });
                        }

                        element = element.parentElement;
                    }
                });
        } finally {
            vueInspectionInProgress = false;
        }
    }

    function scheduleRender(delay = 250) {
        clearTimeout(renderTimer);

        renderTimer = setTimeout(() => {
            inspectVueState();
            renderMetadata();
        }, delay);
    }

    function startScript() {
        console.log(
            'DocMgt metadata script loaded for saved search ' +
            TARGET_SAVED_SEARCH_ID
        );

        const observer = new MutationObserver(() => {
            scheduleRender();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'class',
                'href',
                'value'
            ]
        });

        window.addEventListener(
            'popstate',
            () => scheduleRender(100)
        );

        window.addEventListener(
            'hashchange',
            () => scheduleRender(100)
        );

        document.addEventListener(
            'change',
            () => scheduleRender(100)
        );

        document.addEventListener(
            'click',
            () => {
                scheduleRender(100);

                setTimeout(
                    () => scheduleRender(100),
                    600
                );

                setTimeout(
                    () => scheduleRender(100),
                    1500
                );
            }
        );

        scheduleRender(100);
    }

    window.DM_METADATA = {
        targetSavedSearchID:
            TARGET_SAVED_SEARCH_ID,

        capturedResponses,

        isActive() {
            return isTargetSearchActive();
        },

        refresh() {
            scheduleRender(0);
        },

        clearCapturedData() {
            capturedResponses.length = 0;
            scheduleRender(0);
        },

        getRecords() {
            return getAllCapturedRecords();
        },

        findRecord(recordID) {
            const targetID =
                String(recordID ?? '');

            return getAllCapturedRecords()
                .filter(candidate => {
                    const candidateID =
                        candidate.record.ID ??
                        candidate.record.RecordID;

                    return (
                        String(candidateID) === targetID
                    );
                });
        },

        findText(text) {
            const searchText = normalize(text);

            return getAllCapturedRecords()
                .filter(candidate => {
                    return buildRecordSearchText(
                        candidate.record
                    ).includes(searchText);
                });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            startScript
        );
    } else {
        startScript();
    }
})();