// --- Init ---
async function init() {
    log("System initializing...", "info");
    initUIControllers();
    try { await checkStatus(); } catch(e) {}
    await refreshProfileList();
    
    const list = document.querySelectorAll('#profile-list li');
    if(list.length > 0) {
        const first = list[0].getAttribute('data-name');
        if (first) await loadProfile(first);
    } else {
        await createNewProfile("Default");
    }
    
    DragManager.init(document.getElementById('connections-layer'));
    initSidebarResizer();
    initLogResizer();
    setSidebarCollapsed(false);
    setConsoleVisibility(true);
    if (window.visualViewport) {
    }
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.addEventListener('transitionend', (e) => {
            if (['width','padding','gap','border-right-width'].includes(e.propertyName)) scheduleRedraw();
        });
    }
    const consoleContainer = document.getElementById('console-container');
    if (consoleContainer) {
        consoleContainer.addEventListener('transitionend', (e) => {
            if (['height','max-height','opacity'].includes(e.propertyName)) scheduleRedraw();
        });
    }
    setInterval(checkStatus, 3000);
}

// --- Persistence ---
const AUTO_CONFIG_SAVE_DEBOUNCE_MS = 600;
const AUTO_CONFIG_SAVE_ERROR_TOAST_COOLDOWN_MS = 6000;
let autoConfigSaveTimer = null;
let autoConfigSaveInFlight = null;
let autoConfigSavePending = false;
let autoConfigSaveLastSignature = null;
let autoConfigSaveLastErrorToastAt = 0;
let autoConfigSaveLastErrorKey = null;

function getConfigSignature(config) {
    try { return JSON.stringify(config); } catch (e) { return null; }
}

function logAutoSaveError(message, options = {}) {
    const { allowToast = false } = options;
    const now = Date.now();
    const key = String(message || 'unknown');
    const canToast = allowToast && (now - autoConfigSaveLastErrorToastAt > AUTO_CONFIG_SAVE_ERROR_TOAST_COOLDOWN_MS || autoConfigSaveLastErrorKey !== key);
    autoConfigSaveLastErrorKey = key;
    if (canToast) autoConfigSaveLastErrorToastAt = now;
    log(key, 'error', { toast: canToast });
}

function scheduleAutoConfigSave() {
    if (!appState.currentProfile) return;
    autoConfigSavePending = true;
    if (autoConfigSaveTimer) clearTimeout(autoConfigSaveTimer);
    autoConfigSaveTimer = setTimeout(() => {
        autoConfigSaveTimer = null;
        runAutoConfigSave().catch(() => {});
    }, AUTO_CONFIG_SAVE_DEBOUNCE_MS);
}

async function runAutoConfigSave(options = {}) {
    const { force = false } = options;
    if (!appState.currentProfile) return false;

    if (autoConfigSaveInFlight) {
        autoConfigSavePending = true;
        return autoConfigSaveInFlight;
    }

    autoConfigSavePending = false;

    let config;
    try {
        config = buildSingboxConfig();
    } catch (e) {
        logAutoSaveError(`Auto-save build failed: ${e.message}`, { allowToast: false });
        return false;
    }

    const signature = getConfigSignature(config);
    if (!force && signature && autoConfigSaveLastSignature === signature) return true;

    const task = (async () => {
        try {
            await saveConfigToServer(config, { logDetail: false });
            if (signature) autoConfigSaveLastSignature = signature;
            return true;
        } catch (e) {
            logAutoSaveError(`Auto-save failed: ${e.message}`, { allowToast: true });
            return false;
        }
    })();

    autoConfigSaveInFlight = task.finally(() => { autoConfigSaveInFlight = null; });
    const ok = await autoConfigSaveInFlight;

    if (autoConfigSavePending) scheduleAutoConfigSave();
    return ok;
}

async function flushAutoConfigSave() {
    if (autoConfigSaveTimer) {
        clearTimeout(autoConfigSaveTimer);
        autoConfigSaveTimer = null;
    }
    if (autoConfigSaveInFlight) await autoConfigSaveInFlight;
    return await runAutoConfigSave({ force: false });
}

async function saveCurrentProfile() {
    if (!appState.currentProfile) return;
    normalizeTopology();
    try {
        const res = await fetch(`${API_URL}/profiles/save`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: appState.currentProfile, 
                content: { 
                    layers: appState.layers, 
                    nodeLibrary: appState.nodeLibrary,
                    inbounds: appState.inbounds
                } 
            }) 
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch(e) { log("Save failed: " + e.message, "error"); }
    scheduleAutoConfigSave();
}

// --- Sidebar ---
async function refreshProfileList() {
    try {
        const res = await fetch(`${API_URL}/profiles/list`);
        const data = await res.json();
        const list = document.getElementById('profile-list');
        list.innerHTML = '';
        if (data.profiles) data.profiles.forEach(f => {
            const li = document.createElement('li');
            li.textContent = f.replace('.json', '');
            li.setAttribute('data-name', f);
            li.onclick = () => loadProfile(f);
            if(appState.currentProfile === f) li.classList.add('active');
            const del = document.createElement('span'); del.innerHTML='×'; del.style.cssText='float:right;color:#ef4444;cursor:pointer';
            del.onclick=(e)=>{e.stopPropagation(); deleteProfile(f);};
            li.appendChild(del);
            list.appendChild(li);
        });
    } catch(e) {}
}

async function loadProfile(f) {
    try {
        const res = await fetch(`${API_URL}/profiles/load?name=${encodeURIComponent(f)}`);
        const data = await res.json();
        if (data.status === 'success') {
            const raw = data.data || {};
            if (!Array.isArray(raw.layers) || !Array.isArray(raw.inbounds) || !Array.isArray(raw.nodeLibrary)) {
                log(`Unsupported profile format: ${f}`, "error");
                return;
            }

            appState.currentProfile = f;
            appState.layers = raw.layers;
            appState.inbounds = raw.inbounds;
            appState.nodeLibrary = raw.nodeLibrary;

            if (!appState.nodeLibrary.find(n => n && n.tag === 'direct')) {
                appState.nodeLibrary.push({ id: 'lib-direct', tag: 'direct', type: 'direct' });
            }

            normalizeTopology();
            render();
            scheduleAutoConfigSave();
            await refreshProfileList();
            log(`Loaded ${f}`, "success");
        }
    } catch(e) {}
}

async function createNewProfile(n) {
    const raw = (typeof n === 'string') ? n.trim() : '';
    if (!raw) {
        openProfileModal();
        return;
    }

    let name = raw;
    if (!name.endsWith('.json')) name += '.json';

    try {
        const res = await fetch(`${API_URL}/profiles/create`, { method: 'POST', body: JSON.stringify({ name }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.status === 'error') {
            throw new Error(data.message || 'Profile create failed');
        }
        await refreshProfileList();
        await loadProfile(name);
        log(`Created ${name}`, "success");
    } catch (e) {
        log(`Create failed: ${e.message}`, "error");
    }
}

function openProfileModal(prefill = '') {
    if (ModalControllers.profile) ModalControllers.profile.open();
    const input = document.getElementById('profile-name');
    if (input) {
        input.value = prefill;
        input.focus();
        input.select();
        input.onkeydown = (e) => {
            if (e.key === 'Enter') confirmProfileModal();
            if (e.key === 'Escape') closeProfileModal();
        };
    }
}

function closeProfileModal() {
    if (ModalControllers.profile) ModalControllers.profile.close();
    const input = document.getElementById('profile-name');
    if (input) input.value = '';
}

async function confirmProfileModal() {
    const input = document.getElementById('profile-name');
    const raw = (input && typeof input.value === 'string') ? input.value.trim() : '';
    if (!raw) {
        log("Profile name is required", "error");
        return;
    }
    if (raw.includes('/') || raw.includes('\\') || raw.includes('..')) {
        log("Invalid profile name", "error");
        return;
    }
    closeProfileModal();
    await createNewProfile(raw);
}

async function deleteProfile(f) {
    await fetch(`${API_URL}/profiles/delete`, { method:'POST', body:JSON.stringify({name:f}) });
    if(appState.currentProfile===f) { appState.layers=[]; appState.currentProfile=null; render(); }
    refreshProfileList();
    log(`Deleted ${f}`, "success");
}

// --- Deployment ---
function buildSingboxConfig() {
    normalizeTopology();
    return ChainCore.buildSingboxConfig(appState, {
        resolveNodeDefinition,
        getNodeType,
        log
    });
}

function logValidationDetail(detail, status = 'info') {
    if (!detail) return;
    const type = status === 'error' ? 'error' : 'info';
    detail.split(/\r?\n/).forEach(l => {
        const t = l.trim();
        if (t) log(t, type, { toast: false });
    });
}

async function saveConfigToServer(config, options = {}) {
    const { logDetail = true } = options;
    const res = await fetch(`${API_URL}/save_config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    const data = await res.json();
    const shouldLogDetail = logDetail || data.status !== 'success';
    if (shouldLogDetail && data.detail) logValidationDetail(data.detail, data.status === 'success' ? 'info' : 'error');
    if (data.status !== 'success') {
        const msg = data.message || 'Config save failed';
        throw new Error(msg);
    }
    return data;
}

// --- Config Management Functions ---
async function restartCore() {
    if (!appState.currentProfile) {
        log("No profile selected", "error");
        return;
    }

    if (isProcessing) return;
    isProcessing = true;

    try {
        log("Restarting...", "info");
        lastLogLineCount = 0;
        await saveCurrentProfile();
        const ok = await flushAutoConfigSave();
        if (!ok) {
            log("Restart aborted: config auto-save failed", "error");
            return;
        }

        await fetch(`${API_URL}/stop`, { method: 'POST' });
        await new Promise(r => setTimeout(r, 500));

        const startRes = await fetch(`${API_URL}/start`, { method: 'POST' });
        const startData = await startRes.json();
        if (startData.status === 'success') {
            log("Core restarted.", "success");
            if (startData.detail) logValidationDetail(startData.detail, 'info');
        } else {
            log(`Start failed: ${startData.message}`, "error");
            if (startData.detail) logValidationDetail(startData.detail, 'error');
            if (String(startData.message || '').includes("logs")) await fetchCoreLogs();
        }
    } catch (e) {
        log(`Restart failed: ${e.message}`, "error");
    } finally {
        isProcessing = false;
        checkStatus();
    }
}

async function exportConfig() {
    if (!appState.currentProfile) {
        log("No profile selected", "error");
        return;
    }

    try {
        log("Generating sing-box config...", "info");
        const config = buildSingboxConfig();

        // Download as JSON file
        const configStr = JSON.stringify(config, null, 2);
        const blob = new Blob([configStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${appState.currentProfile.replace('.json', '')}-config.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        log(`Config exported: ${a.download}`, "success");
    } catch (e) {
        log(`Export failed: ${e.message}`, "error");
    }
}

async function toggleService() {
    if(isProcessing) return;
    isProcessing = true;
    const btn = document.getElementById('btn-start');
    const isRunning = btn.classList.contains('btn-danger');

    try {
        if(isRunning) {
            log("Stopping...", "info");
            await fetch(`${API_URL}/stop`, { method: 'POST' });
            btn.className = 'btn-success'; btn.querySelector('span').textContent = 'Start Core';
            lastLogLineCount = 0; // reset log counter
        } else {
            log("Starting...", "info");
            lastLogLineCount = 0; // reset before start
            await saveCurrentProfile();
            const ok = await flushAutoConfigSave();
            if (!ok) {
                log("Start aborted: config auto-save failed", "error");
                return;
            }
            const res = await fetch(`${API_URL}/start`, { method: 'POST' });
            const data = await res.json();
            if(data.status === 'success') {
                log("Started.", "success");
                if (data.detail) logValidationDetail(data.detail, 'info');
                btn.className = 'btn-danger'; btn.querySelector('span').textContent = 'Stop Core';
            } else {
                log("Start Failed: " + data.message, "error");
                if (data.detail) logValidationDetail(data.detail, 'error');
                if(data.message.includes("logs")) await fetchCoreLogs();
            }
        }
    } catch(e) {}
    finally { isProcessing = false; }
}

async function fetchCoreLogs() {
    try {
        const res = await fetch(`${API_URL}/core_logs`);
        const data = await res.json();
        if(data.logs) {
            log("--- CORE LOG ---", "warning");
            data.logs.forEach(l => log(l.trim(), "error", { toast: false }));
        }
    } catch(e) {}
}

async function checkStatus() {
    if(isProcessing) return;
    try {
        const res = await fetch(`${API_URL}/status`, { method: 'POST' });
        const data = await res.json();
        const btn = document.getElementById('btn-start');
        if(data.running) {
            btn.className = 'btn-danger'; btn.querySelector('span').textContent = 'Stop Core';
            // fetch and display latest logs on each status poll
            await fetchAndDisplayLatestLogs();
        } else {
            btn.className = 'btn-success'; btn.querySelector('span').textContent = 'Start Core';
        }
    } catch(e) {}
}

let lastLogLineCount = 0;
async function fetchAndDisplayLatestLogs() {
    try {
        const res = await fetch(`${API_URL}/core_logs`);
        const data = await res.json();
        if (data.logs && data.logs.length < lastLogLineCount) lastLogLineCount = 0;
        if(data.logs && data.logs.length > lastLogLineCount) {
            // only show new log lines
            const newLogs = data.logs.slice(lastLogLineCount);
            newLogs.forEach(l => {
                const trimmed = l.trim();
                if (trimmed) {
                    // color by log level
                    let logType = 'info';
                    if (trimmed.includes('error') || trimmed.includes('ERROR') || trimmed.includes('failed')) {
                        logType = 'error';
                    } else if (trimmed.includes('warn') || trimmed.includes('WARN')) {
                        logType = 'warning';
                    }
                    log(trimmed, logType, { toast: false });
                }
            });
            lastLogLineCount = data.logs.length;
        }
    } catch(e) {
        console.error('Failed to fetch logs:', e);
    }
}

// Exports
