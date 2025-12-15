// --- State ---
let isProcessing = false;
let appState = {
    currentProfile: null,
    layers: [],
    nodeLibrary: [],
    editingNode: null,
    editingLayerId: null,
    nodePickerLayerId: null,
    editingInboundTag: null,
    // Config
    inbounds: [] // [{ tag:'mixed-10808', type:'mixed', port:10808, detours: [], selectorDefault:null }]
};

// --- Helpers ---
function findNodeDefinition(tag) {
    if (!tag) return null;
    return appState.nodeLibrary.find(n => n.tag === tag) || null;
}

function resolveNodeDefinition(node) {
    if (!node) return null;
    return findNodeDefinition(node.tag);
}

function getNodeTag(node) {
    return node?.tag || 'unassigned';
}

function getNodeType(node) {
    const def = resolveNodeDefinition(node);
    return (def && def.type) || node?.type || 'selector';
}

function isTagPlaced(tag) {
    if (!tag) return false;
    const layers = Array.isArray(appState.layers) ? appState.layers : [];
    for (const layer of layers) {
        const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
        for (const node of nodes) {
            if (node && node.tag === tag) return true;
        }
    }
    return false;
}

function removeOutboundTag(tag) {
    if (!tag) return { placementsRemoved: 0, detoursRemoved: 0 };

    let placementsRemoved = 0;
    let detoursRemoved = 0;

    const layers = Array.isArray(appState.layers) ? appState.layers : [];
    for (const layer of layers) {
        const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
        const beforeLen = nodes.length;
        const kept = nodes.filter(n => n && n.tag !== tag);
        placementsRemoved += (beforeLen - kept.length);
        layer.nodes = kept;

        for (const node of layer.nodes) {
            if (!Array.isArray(node.detours)) continue;
            const before = node.detours.length;
            node.detours = node.detours.filter(d => d !== tag);
            detoursRemoved += (before - node.detours.length);
        }
    }

    const inbounds = Array.isArray(appState.inbounds) ? appState.inbounds : [];
    for (const inbound of inbounds) {
        if (!Array.isArray(inbound.detours)) inbound.detours = [];
        const before = inbound.detours.length;
        inbound.detours = inbound.detours.filter(d => d !== tag);
        detoursRemoved += (before - inbound.detours.length);

        if (inbound.selectorDefault === tag) {
            inbound.selectorDefault = inbound.detours[0] || null;
        }
    }

    return { placementsRemoved, detoursRemoved };
}

function applyTagChange(oldTag, newTag) {
    if (!oldTag || oldTag === newTag) return;
    appState.layers.forEach(l => l.nodes.forEach(n => {
        if (n.tag === oldTag) {
            n.tag = newTag;
        }
        if (Array.isArray(n.detours)) {
            n.detours = n.detours.map(d => d === oldTag ? newTag : d);
        }
    }));

    const inbounds = Array.isArray(appState.inbounds) ? appState.inbounds : [];
    inbounds.forEach(ib => {
        if (Array.isArray(ib.detours)) {
            ib.detours = ib.detours.map(d => d === oldTag ? newTag : d);
        }
        if (ib.selectorDefault === oldTag) {
            ib.selectorDefault = newTag;
        }
    });
}

function normalizeTopology() {
    if (!Array.isArray(appState.nodeLibrary)) appState.nodeLibrary = [];
    if (!appState.nodeLibrary.find(n => n && n.tag === 'direct')) {
        appState.nodeLibrary.push({ id: 'lib-direct', tag: 'direct', type: 'direct' });
    }

    ChainCore.sanitizeInboundDefaults(appState);

    let changed = false;

    const layers = Array.isArray(appState.layers) ? appState.layers : [];
    const libraryTags = new Set(
        appState.nodeLibrary
            .map(n => (n && typeof n.tag === 'string') ? n.tag : null)
            .filter(Boolean)
    );

    const seenPlaced = new Set();
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const layer = layers[layerIndex];
        const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
        const kept = [];
        for (const node of nodes) {
            const tag = node?.tag;
            if (!tag) {
                changed = true;
                continue;
            }
            if (tag === 'direct') {
                changed = true;
                continue;
            }
            if (!libraryTags.has(tag)) {
                changed = true;
                continue;
            }
            if (seenPlaced.has(tag)) {
                changed = true;
                continue;
            }
            seenPlaced.add(tag);
            kept.push(node);
        }
        if (kept.length !== nodes.length) {
            layer.nodes = kept;
        }
    }

    const tagToLayer = new Map();
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const layer = layers[layerIndex];
        const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
        for (const node of nodes) {
            const tag = node?.tag;
            if (tag) tagToLayer.set(tag, layerIndex);
        }
    }

    const unique = (arr) => Array.from(new Set(arr));
    const inLayer = (tag, layerIndex) => tagToLayer.get(tag) === layerIndex;
    const arrayEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

    const inbounds = Array.isArray(appState.inbounds) ? appState.inbounds : [];
    for (const inbound of inbounds) {
        const before = Array.isArray(inbound.detours) ? inbound.detours.filter(Boolean) : [];
        const after = unique(before).filter(t => inLayer(t, 0));
        if (!arrayEq(before, after)) changed = true;
        inbound.detours = after;

        if (inbound.selectorDefault && !after.includes(inbound.selectorDefault)) {
            inbound.selectorDefault = after[0] || null;
            changed = true;
        }
    }

    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const layer = layers[layerIndex];
        const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
        for (const node of nodes) {
            const before = Array.isArray(node.detours) ? node.detours.filter(Boolean) : [];
            const type = getNodeType(node);
            const isLastHop = layerIndex === (layers.length - 1);

            if (type === 'roundrobin') {
                const candidates = unique(before).filter(t => inLayer(t, layerIndex + 1));
                const outTargets = unique(before).filter(t => {
                    if (t === 'direct') return layerIndex === (layers.length - 2);
                    return inLayer(t, layerIndex + 2);
                });
                const output = outTargets[0] || null;
                const after = output ? [...candidates, output] : candidates;
                if (!arrayEq(before, after)) changed = true;
                node.detours = after;
                continue;
            }

            const filtered = unique(before).filter(t => inLayer(t, layerIndex + 1) || (isLastHop && t === 'direct'));
            const isSelectorLike = type === 'selector' || type === 'urltest';
            const after = isSelectorLike ? filtered : (filtered[0] ? [filtered[0]] : []);
            if (!arrayEq(before, after)) changed = true;
            node.detours = after;
        }
    }

    const rrManagedCandidates = new Set();
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const layer = layers[layerIndex];
        const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
        for (const node of nodes) {
            if (!node || getNodeType(node) !== 'roundrobin') continue;
            const detours = Array.isArray(node.detours) ? node.detours.filter(Boolean) : [];
            const candidates = detours.filter(t => inLayer(t, layerIndex + 1));
            const hasOutput = detours.some(t => {
                if (t === 'direct') return layerIndex === (layers.length - 2);
                return inLayer(t, layerIndex + 2);
            });
            if (!hasOutput) continue;
            candidates.forEach(t => rrManagedCandidates.add(t));
        }
    }

    if (rrManagedCandidates.size > 0) {
        for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
            const layer = layers[layerIndex];
            const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
            for (const node of nodes) {
                const tag = node?.tag;
                if (!tag || !rrManagedCandidates.has(tag)) continue;
                const before = Array.isArray(node.detours) ? node.detours.filter(Boolean) : [];
                if (before.length > 0) {
                    node.detours = [];
                    changed = true;
                }
            }
        }
    }

    if (changed) {
        log('Topology normalized: removed invalid links', 'warning', { toast: false });
    }

    return changed;
}
