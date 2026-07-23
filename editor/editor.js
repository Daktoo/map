(function () {
    'use strict';

    const MARKER_FILES = [
        'builds.json',
        'farms.json',
        'shops.json',
        'stations.json',
        'wxt.json',
        'pvp.json'
    ];

    const SORT_FIELDS = ['id', 'label', 'dial', 'x', 'y', 'z', 'info'];

    let editorActive = false;
    let panelEl = null;
    /** @type {Record<string, { filename: string, data: object, open: boolean }>} */
    let fileStore = {};
    let editing = null; // null | { file, id } | { file: null, id: 'new' }
    let searchTerm = '';
    /** @type {Record<string, { field: string, dir: 'asc' | 'desc' }>} */
    let sortState = {};

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getSetNode(data) {
        if (!data || typeof data !== 'object') return null;
        if (data.group != null || data.markers) return data;
        const values = Object.values(data).filter(
            function (set) {
                return set && typeof set === 'object' && (set.group != null || set.markers);
            }
        );
        return values[0] || null;
    }

    function getMarkers(filename) {
        const entry = fileStore[filename];
        if (!entry) return {};
        const set = getSetNode(entry.data);
        if (!set) return {};
        if (!set.markers) set.markers = {};
        return set.markers;
    }

    function getGroupLabel(filename) {
        const entry = fileStore[filename];
        if (!entry) return filename;
        const set = getSetNode(entry.data);
        return (set && set.group) || filename;
    }

    function nextId(filename) {
        const markers = getMarkers(filename);
        let max = 0;
        Object.keys(markers).forEach(function (k) {
            const n = parseInt(k, 10);
            if (!isNaN(n) && n > max) max = n;
        });
        return String(max + 1);
    }

    function matchesSearch(m, id, term) {
        if (!term) return true;
        term = term.toLowerCase();
        return String(id).toLowerCase().includes(term) ||
            (m.label || '').toLowerCase().includes(term) ||
            (m.dial || '').toLowerCase().includes(term) ||
            (m.info || '').toLowerCase().includes(term) ||
            (m.desc || '').toLowerCase().includes(term) ||
            String(m.x || '').toLowerCase().includes(term) ||
            String(m.z || '').toLowerCase().includes(term);
    }

    function compareMarkers(a, b, field, dir) {
        let av;
        let bv;
        if (field === 'id') {
            av = parseInt(a.id, 10);
            bv = parseInt(b.id, 10);
            if (isNaN(av)) av = 0;
            if (isNaN(bv)) bv = 0;
        } else if (field === 'x' || field === 'y' || field === 'z') {
            av = Number(a.marker[field]);
            bv = Number(b.marker[field]);
            if (isNaN(av)) av = 0;
            if (isNaN(bv)) bv = 0;
        } else {
            av = String((a.marker[field] != null ? a.marker[field] : '')).toLowerCase();
            bv = String((b.marker[field] != null ? b.marker[field] : '')).toLowerCase();
        }
        let cmp = 0;
        if (av < bv) cmp = -1;
        else if (av > bv) cmp = 1;
        return dir === 'desc' ? -cmp : cmp;
    }

    function sortedMarkerEntries(filename) {
        const markers = getMarkers(filename);
        const term = searchTerm;
        const entries = Object.keys(markers)
            .filter(function (id) { return matchesSearch(markers[id], id, term); })
            .map(function (id) { return { id: id, marker: markers[id] }; });

        const sort = sortState[filename] || { field: 'id', dir: 'asc' };
        entries.sort(function (a, b) {
            return compareMarkers(a, b, sort.field, sort.dir);
        });
        return entries;
    }

    function downloadBlob(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function downloadFile(filename) {
        const entry = fileStore[filename];
        if (!entry) return;
        downloadBlob(filename, entry.data);
    }

    function downloadAll() {
        MARKER_FILES.forEach(function (filename, i) {
            if (!fileStore[filename]) return;
            // Stagger downloads slightly so browsers don't block repeated clicks
            setTimeout(function () {
                downloadFile(filename);
            }, i * 150);
        });
    }

    function setStatus(msg) {
        const el = document.getElementById('editor-status');
        if (el) el.textContent = msg;
    }

    function openForm(file, id) {
        editing = id ? { file: file, id: id } : { file: file || MARKER_FILES[0], id: 'new' };
        renderForm();
        const form = document.getElementById('editor-form-container');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closeForm() {
        editing = null;
        renderForm();
    }

    function readFormValues() {
        return {
            file: document.getElementById('f-file').value,
            label: document.getElementById('f-label').value.trim(),
            info: document.getElementById('f-info').value.trim(),
            desc: document.getElementById('f-desc').value.trim(),
            x: document.getElementById('f-x').value.trim(),
            y: document.getElementById('f-y').value.trim() || '64',
            z: document.getElementById('f-z').value.trim(),
            dial: document.getElementById('f-dial').value.trim()
        };
    }

    function saveForm() {
        if (!editing) return;
        const values = readFormValues();
        const entry = {
            label: values.label,
            desc: values.desc,
            x: values.x,
            y: values.y,
            z: values.z,
            info: values.info,
            dial: values.dial
        };

        if (editing.id === 'new') {
            const id = nextId(values.file);
            getMarkers(values.file)[id] = entry;
        } else if (values.file === editing.file) {
            getMarkers(editing.file)[editing.id] = entry;
        } else {
            delete getMarkers(editing.file)[editing.id];
            const id = nextId(values.file);
            getMarkers(values.file)[id] = entry;
        }

        editing = null;
        renderForm();
        renderGroups();
        setStatus('Saved. Download the JSON file(s) when finished, then replace them in the repo.');
    }

    function deleteMarker(file, id) {
        if (!confirm('Delete this marker? This cannot be undone until you re-download the original file.')) {
            return;
        }
        delete getMarkers(file)[id];
        if (editing && editing.file === file && editing.id === id) {
            closeForm();
        }
        renderGroups();
    }

    function fileOptionsHtml(selected) {
        return MARKER_FILES.map(function (f) {
            const label = getGroupLabel(f) + ' (' + f + ')';
            const sel = f === selected ? ' selected' : '';
            return '<option value="' + escapeHtml(f) + '"' + sel + '>' + escapeHtml(label) + '</option>';
        }).join('');
    }

    function renderForm() {
        const container = document.getElementById('editor-form-container');
        if (!container) return;
        if (!editing) {
            container.innerHTML = '';
            return;
        }

        const isNew = editing.id === 'new';
        const m = isNew
            ? { label: '', info: '', desc: '', x: '', y: '64', z: '', dial: '' }
            : (getMarkers(editing.file)[editing.id] || {});
        const selectedFile = isNew ? (editing.file || MARKER_FILES[0]) : editing.file;

        container.innerHTML =
            '<div class="poi-form">' +
            '<label>File <select id="f-file">' + fileOptionsHtml(selectedFile) + '</select></label>' +
            '<label>Label <input id="f-label" type="text" value="' + escapeHtml(m.label) + '"></label>' +
            '<label>Info <input id="f-info" type="text" value="' + escapeHtml(m.info) + '"></label>' +
            '<label>Dial (no /dial) <input id="f-dial" type="text" value="' + escapeHtml(m.dial) + '"></label>' +
            '<label>X <input id="f-x" type="text" value="' + escapeHtml(m.x) + '"></label>' +
            '<label>Y <input id="f-y" type="text" value="' + escapeHtml(m.y != null ? m.y : '64') + '"></label>' +
            '<label>Z <input id="f-z" type="text" value="' + escapeHtml(m.z) + '"></label>' +
            '<label class="form-span-2">Desc <textarea id="f-desc">' + escapeHtml(m.desc) + '</textarea></label>' +
            '<div class="poi-form-actions">' +
            '<button type="button" class="editor-btn btn-save" id="f-save">Save</button>' +
            '<button type="button" class="editor-btn btn-cancel" id="f-cancel">Cancel</button>' +
            '</div></div>';

        document.getElementById('f-save').addEventListener('click', saveForm);
        document.getElementById('f-cancel').addEventListener('click', closeForm);
    }

    function sortHeaderClass(filename, field) {
        const sort = sortState[filename];
        if (!sort || sort.field !== field) return '';
        return sort.dir === 'desc' ? 'sorted-desc' : 'sorted-asc';
    }

    function toggleSort(filename, field) {
        const current = sortState[filename];
        if (current && current.field === field) {
            sortState[filename] = {
                field: field,
                dir: current.dir === 'asc' ? 'desc' : 'asc'
            };
        } else {
            sortState[filename] = { field: field, dir: 'asc' };
        }
        renderGroups();
    }

    function captureOpenState() {
        MARKER_FILES.forEach(function (filename) {
            const details = document.querySelector('details.file-group[data-file="' + filename + '"]');
            if (details && fileStore[filename]) {
                fileStore[filename].open = details.open;
            }
        });
    }

    function renderGroups() {
        const listEl = document.getElementById('editor-groups');
        if (!listEl) return;

        captureOpenState();
        listEl.innerHTML = '';

        MARKER_FILES.forEach(function (filename) {
            if (!fileStore[filename]) return;

            const entries = sortedMarkerEntries(filename);
            const totalCount = Object.keys(getMarkers(filename)).length;
            const open = fileStore[filename].open !== false;

            const details = document.createElement('details');
            details.className = 'file-group';
            details.dataset.file = filename;
            details.open = open;

            const summary = document.createElement('summary');
            const countLabel = searchTerm
                ? entries.length + ' of ' + totalCount + ' markers'
                : totalCount + ' markers';
            summary.innerHTML =
                '<span class="file-group-title">' + escapeHtml(getGroupLabel(filename)) + '</span>' +
                '<span class="file-group-meta">' + escapeHtml(filename) + ' — ' + countLabel + '</span>' +
                '<span class="file-group-actions">' +
                '<button type="button" class="editor-btn btn-download" data-download="' +
                escapeHtml(filename) + '">Download</button>' +
                '</span>';
            details.appendChild(summary);

            const body = document.createElement('div');
            body.className = 'file-group-body';

            if (entries.length === 0) {
                body.innerHTML = '<div class="empty-rows">' +
                    (searchTerm ? 'No markers match this search.' : 'No markers in this file.') +
                    '</div>';
            } else {
                const table = document.createElement('table');
                table.className = 'poi-table';
                const thead = document.createElement('thead');
                const headRow = document.createElement('tr');
                SORT_FIELDS.forEach(function (field) {
                    const th = document.createElement('th');
                    th.textContent = field === 'id' ? 'ID' : field.charAt(0).toUpperCase() + field.slice(1);
                    th.className = sortHeaderClass(filename, field);
                    th.dataset.sort = field;
                    headRow.appendChild(th);
                });
                const actionsTh = document.createElement('th');
                actionsTh.className = 'no-sort';
                actionsTh.textContent = '';
                headRow.appendChild(actionsTh);
                thead.appendChild(headRow);
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                entries.forEach(function (item) {
                    const m = item.marker;
                    const tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td>' + escapeHtml(item.id) + '</td>' +
                        '<td>' + escapeHtml(m.label) + '</td>' +
                        '<td>' + escapeHtml(m.dial) + '</td>' +
                        '<td>' + escapeHtml(m.x) + '</td>' +
                        '<td>' + escapeHtml(m.y) + '</td>' +
                        '<td>' + escapeHtml(m.z) + '</td>' +
                        '<td>' + escapeHtml(m.info) + '</td>' +
                        '<td class="actions">' +
                        '<button type="button" class="editor-btn btn-edit" data-file="' +
                        escapeHtml(filename) + '" data-id="' + escapeHtml(item.id) + '">Edit</button> ' +
                        '<button type="button" class="editor-btn btn-delete" data-file="' +
                        escapeHtml(filename) + '" data-id="' + escapeHtml(item.id) + '">Delete</button>' +
                        '</td>';
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                body.appendChild(table);
            }

            details.appendChild(body);
            listEl.appendChild(details);
        });

        listEl.querySelectorAll('[data-download]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                downloadFile(btn.getAttribute('data-download'));
            });
        });

        listEl.querySelectorAll('th[data-sort]').forEach(function (th) {
            th.addEventListener('click', function () {
                const details = th.closest('details.file-group');
                if (!details) return;
                toggleSort(details.dataset.file, th.getAttribute('data-sort'));
            });
        });

        listEl.querySelectorAll('.btn-edit').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openForm(btn.getAttribute('data-file'), btn.getAttribute('data-id'));
            });
        });

        listEl.querySelectorAll('.btn-delete').forEach(function (btn) {
            btn.addEventListener('click', function () {
                deleteMarker(btn.getAttribute('data-file'), btn.getAttribute('data-id'));
            });
        });
    }

    function addFilePickerFallback() {
        const existing = document.getElementById('editor-file-fallback');
        if (existing) return;

        const label = document.createElement('label');
        label.id = 'editor-file-fallback';
        label.className = 'file-picker-fallback';
        label.innerHTML = 'Load a local marker JSON file: ';
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.multiple = true;
        input.addEventListener('change', function () {
            const files = Array.prototype.slice.call(input.files || []);
            if (!files.length) return;

            let remaining = files.length;
            files.forEach(function (file) {
                const name = file.name;
                if (MARKER_FILES.indexOf(name) === -1) {
                    remaining -= 1;
                    if (remaining === 0) {
                        renderGroups();
                        renderForm();
                    }
                    setStatus('Skipped ' + name + ' (not a known marker file).');
                    return;
                }
                const reader = new FileReader();
                reader.onload = function () {
                    try {
                        const json = JSON.parse(reader.result);
                        fileStore[name] = {
                            filename: name,
                            data: json,
                            open: fileStore[name] ? fileStore[name].open !== false : true
                        };
                        setStatus('Loaded ' + name + ' from disk.');
                    } catch (e) {
                        setStatus('Could not parse ' + name + ' as JSON.');
                    }
                    remaining -= 1;
                    if (remaining === 0) {
                        renderGroups();
                        renderForm();
                    }
                };
                reader.readAsText(file);
            });
        });
        label.appendChild(input);

        const panel = document.getElementById('editor-panel');
        const toolbar = document.getElementById('editor-toolbar');
        if (panel && toolbar) {
            panel.insertBefore(label, toolbar.nextSibling);
        }
    }

    function createPanel() {
        const wrap = document.createElement('div');
        wrap.id = 'editor-panel-wrap';

        const panel = document.createElement('div');
        panel.id = 'editor-panel';
        panel.innerHTML =
            '<div class="editor-header">' +
            '<h2>Marker editor</h2>' +
            '<button type="button" class="editor-btn btn-close" id="editor-close-btn">Exit</button>' +
            '</div>' +
            '<p class="editor-status" id="editor-status">Loading marker files…</p>' +
            '<div class="editor-toolbar" id="editor-toolbar">' +
            '<input type="text" id="editor-search" placeholder="Search by label, dial, info, desc, coords…">' +
            '<button type="button" class="editor-btn btn-add" id="editor-add-btn">+ Add marker</button>' +
            '<button type="button" class="editor-btn btn-download" id="editor-download-all-btn">Download all</button>' +
            '</div>' +
            '<div class="editor-body">' +
            '<div id="editor-form-container"></div>' +
            '<div id="editor-groups"></div>' +
            '</div>';

        wrap.appendChild(panel);
        document.body.appendChild(wrap);
        panelEl = wrap;

        document.getElementById('editor-close-btn').addEventListener('click', closeEditor);
        document.getElementById('editor-add-btn').addEventListener('click', function () {
            openForm(MARKER_FILES[0], null);
        });
        document.getElementById('editor-download-all-btn').addEventListener('click', downloadAll);
        document.getElementById('editor-search').addEventListener('input', function (e) {
            searchTerm = e.target.value.trim();
            renderGroups();
        });
        wrap.addEventListener('click', function (e) {
            if (e.target === wrap) closeEditor();
        });
    }

    function ingestLoadedFiles(results) {
        fileStore = {};
        results.forEach(function (item) {
            fileStore[item.file] = {
                filename: item.file,
                data: item.data,
                open: true
            };
            if (!sortState[item.file]) {
                sortState[item.file] = { field: 'id', dir: 'asc' };
            }
        });
    }

    function loadAllFiles() {
        return Promise.all(MARKER_FILES.map(function (file) {
            return fetch('data/' + file).then(function (res) {
                if (!res.ok) throw new Error(file + ' HTTP ' + res.status);
                return res.json().then(function (data) {
                    return { file: file, data: data };
                });
            });
        }));
    }

    function closeEditor() {
        captureOpenState();
        if (panelEl && panelEl.parentNode) {
            panelEl.parentNode.removeChild(panelEl);
        }
        panelEl = null;
        editorActive = false;
        editing = null;
        searchTerm = '';
        var btn = document.getElementById('editor-toggle-btn');
        if (btn) btn.textContent = 'Editor';
    }

    function openEditor() {
        if (editorActive) {
            closeEditor();
            return;
        }
        editorActive = true;
        var btn = document.getElementById('editor-toggle-btn');
        if (btn) btn.textContent = 'Close editor';

        createPanel();

        loadAllFiles()
            .then(function (results) {
                ingestLoadedFiles(results);
                setStatus('Edit markers below, then download the JSON file(s) and upload them to the repo.');
                renderForm();
                renderGroups();
            })
            .catch(function (err) {
                console.error(err);
                setStatus(
                    'Failed to load marker files (' + err.message + '). ' +
                    'Serve the site locally, or load JSON files with the picker below.'
                );
                addFilePickerFallback();
                // Keep any empty store so UI still works once files are picked
                MARKER_FILES.forEach(function (file) {
                    if (!fileStore[file]) {
                        fileStore[file] = {
                            filename: file,
                            data: { group: file, markers: {} },
                            open: true
                        };
                    }
                    if (!sortState[file]) {
                        sortState[file] = { field: 'id', dir: 'asc' };
                    }
                });
                renderForm();
                renderGroups();
            });
    }

    function addToggleButton() {
        var btn = document.createElement('button');
        btn.id = 'editor-toggle-btn';
        btn.textContent = 'Editor';
        btn.addEventListener('click', openEditor);
        document.body.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addToggleButton);
    } else {
        addToggleButton();
    }
})();
