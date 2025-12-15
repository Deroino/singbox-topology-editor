// --- Inbound Modal Logic ---
function openInboundModal(editTag = null) {
    if (typeof editTag !== 'string') editTag = null;
    if (ModalControllers.inbound) ModalControllers.inbound.open();
    const portInput = document.getElementById('inbound-port');
    const tagInput = document.getElementById('inbound-tag');
    appState.editingInboundTag = editTag;
    if (editTag) {
        const inbound = (appState.inbounds || []).find(i => i.tag === editTag);
        if (inbound) {
            if (portInput) portInput.value = String(inbound.port || '');
            if (tagInput) tagInput.value = inbound.tag || '';
        }
    } else {
        if (portInput) portInput.value = '10809';
        if (tagInput) tagInput.value = '';
    }
    if (portInput) portInput.focus();
}

function closeInboundModal() {
    if (ModalControllers.inbound) ModalControllers.inbound.close();
    appState.editingInboundTag = null;
}

function confirmInbound() {
    const portVal = document.getElementById('inbound-port').value;
    const tagVal = document.getElementById('inbound-tag').value;
    
    if (!portVal) {
        log("Port is required", "error");
        return;
    }
    const port = parseInt(portVal);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
        log("Invalid port. Must be 1-65535.", "error");
        return;
    }
    const tag = tagVal || `mixed-${port}`;

    const existingTag = appState.editingInboundTag;
    if (existingTag) {
        const inbound = (appState.inbounds || []).find(i => i.tag === existingTag);
        if (!inbound) {
            appState.editingInboundTag = null;
        } else {
            if ((appState.inbounds || []).some(i => i.tag === tag && i.tag !== existingTag)) {
                log("Inbound tag already exists", "error");
                return;
            }
            inbound.tag = tag;
            inbound.port = port;
            if (currentSelectorInbound === existingTag) currentSelectorInbound = tag;
            closeInboundModal();
            render();
            saveCurrentProfile();
            log(`Updated inbound ${tag}`, "success");
            return;
        }
    }

    if ((appState.inbounds || []).find(i => i.tag === tag)) {
        log("Inbound tag already exists", "error");
        return;
    }

    appState.inbounds.push({
        tag: tag,
        type: 'mixed',
        port: port,
        detours: [],
        selectorDefault: null
    });
    
    closeInboundModal();
    render();
    saveCurrentProfile();
}

function deleteInbound(inboundTag) {
    appState.inbounds = appState.inbounds.filter(ib => ib.tag !== inboundTag);
    if (currentSelectorInbound === inboundTag) currentSelectorInbound = null;
    if (appState.editingInboundTag === inboundTag) {
        closeInboundModal();
    }
    render();
    saveCurrentProfile();
    log(`Deleted inbound ${inboundTag}`, 'success');
}

function openSelectorModal(inboundTag) {
    const inbound = (appState.inbounds || []).find(i => i.tag === inboundTag);
    if (!inbound || !inbound.detours || inbound.detours.length < 2) {
        log(`Selector not available for ${inboundTag} (needs 2+ connections)`, 'warning');
        return;
    }
    currentSelectorInbound = inboundTag;
    const options = inbound.detours;
    const def = (inbound.selectorDefault && options.includes(inbound.selectorDefault)) ? inbound.selectorDefault : options[0];

    if (selectorInboundTag) selectorInboundTag.textContent = `${inboundTag}-selector`;
    if (selectorDefaultSelect) {
        selectorDefaultSelect.innerHTML = '';
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            selectorDefaultSelect.appendChild(opt);
        });
        selectorDefaultSelect.value = def;
    }

    if (ModalControllers.selector) ModalControllers.selector.open();
}

function closeSelectorModal() {
    currentSelectorInbound = null;
    if (ModalControllers.selector) ModalControllers.selector.close();
}

function saveSelectorConfig() {
    if (!currentSelectorInbound) return closeSelectorModal();
    const inbound = (appState.inbounds || []).find(i => i.tag === currentSelectorInbound);
    if (!inbound) return closeSelectorModal();
    const val = selectorDefaultSelect ? selectorDefaultSelect.value : null;
    if (val && inbound.detours && inbound.detours.includes(val)) {
        inbound.selectorDefault = val;
        log(`Selector ${inbound.tag}-selector default set to ${val}`, 'success');
    }
    closeSelectorModal();
    render();
    saveCurrentProfile();
}

// Exports
