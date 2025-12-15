(() => {

    function sanitizeInboundDefaults(state) {
        if (!state || !state.inbounds) return;
        state.inbounds.forEach(ib => {
            if (!Array.isArray(ib.detours)) ib.detours = [];
            if (typeof ib.selectorDefault === 'undefined') {
                ib.selectorDefault = ib.detours.length > 0 ? ib.detours[0] : null;
            }
            if (ib.selectorDefault && !ib.detours.includes(ib.selectorDefault)) {
                ib.selectorDefault = ib.detours.length > 0 ? ib.detours[0] : null;
            }
        });
    }

    function buildSingboxConfig(state, helpers = {}) {
        const resolveNodeDefinition = helpers.resolveNodeDefinition;

        sanitizeInboundDefaults(state);

        const layers = Array.isArray(state?.layers) ? state.layers : [];
        const tagToLayerIndex = new Map();
        const tagToPlacedNode = new Map();
        layers.forEach((layer, idx) => (layer.nodes || []).forEach(n => {
            if (!n || !n.tag) return;
            tagToLayerIndex.set(n.tag, idx);
            tagToPlacedNode.set(n.tag, n);
        }));

        const layersCount = layers.length;
        const getPlacedType = (tag) => {
            const node = tagToPlacedNode.get(tag);
            if (!node) return null;
            const def = (typeof resolveNodeDefinition === 'function' ? resolveNodeDefinition(node) : null) || node;
            return def.type || node.type || null;
        };

        let inbounds = [];
        const outboundMap = new Map();
        const usedTags = new Set();
        const RR = {
            baseListenPort: 25080,
            baseBackendPort: 25100,
            backendStride: 32,
            prefix: 'sys-rr-'
        };

        const fnv1a32 = (str) => {
            let hash = 0x811c9dc5;
            for (let i = 0; i < str.length; i++) {
                hash ^= str.charCodeAt(i);
                hash = (hash * 0x01000193) >>> 0;
            }
            return hash >>> 0;
        };
        const toHex8 = (n) => (n >>> 0).toString(16).padStart(8, '0');

        const rrGroups = [];
        const rrTagMap = new Map(); // virtual tag -> internal outbound tag
        const rrInternalIds = new Set();

        const registerRoundRobinNodes = () => {
            let idx = 0;
            layers.forEach((layer, layerIndex) => (layer.nodes || []).forEach(n => {
                const def = (typeof resolveNodeDefinition === 'function' ? resolveNodeDefinition(n) : null) || n;
                const tag = def.tag || n.tag;
                if (!tag) return;
                const type = def.type || n.type;
                if (type !== 'roundrobin') return;

                const raw = Array.isArray(n.detours) ? n.detours.filter(Boolean) : [];
                const uniq = (arr) => Array.from(new Set(arr));

                const candidates = uniq(raw).filter(t => tagToLayerIndex.get(t) === layerIndex + 1);
                const outputs = uniq(raw).filter(t => {
                    if (t === 'direct') return layerIndex === (layersCount - 2);
                    return tagToLayerIndex.get(t) === layerIndex + 2;
                });
                const output = outputs[0] || null;

                if (candidates.length < 2) {
                    throw new Error(`Round Robin node "${tag}" requires at least 2 pool links (to next hop).`);
                }
                if (candidates.length > RR.backendStride) {
                    throw new Error(`Round Robin node "${tag}" exceeds max backends (${RR.backendStride}).`);
                }

                if (output) {
                    candidates.forEach(c => {
                        const ct = getPlacedType(c);
                        if (ct === 'selector' || ct === 'urltest' || ct === 'roundrobin') {
                            throw new Error(`Round Robin output chaining does not support candidate "${c}" of type "${ct}". Use protocol nodes instead.`);
                        }
                    });
                }

                let id = toHex8(fnv1a32(tag));
                while (rrInternalIds.has(id)) {
                    id = toHex8(fnv1a32(`${tag}:${rrInternalIds.size}`));
                }
                rrInternalIds.add(id);

                const baseTag = `${RR.prefix}${id}`;
                const outboundTag = `${baseTag}-lb`;
                rrTagMap.set(tag, outboundTag);

                const groupIndex = idx++;
                const listenPort = RR.baseListenPort + groupIndex;
                const backendBase = RR.baseBackendPort + groupIndex * RR.backendStride;

                const inboundTags = candidates.map((_, i) => `${baseTag}-in-${i}`);
                const backendPorts = candidates.map((_, i) => backendBase + i);

                rrGroups.push({
                    id,
                    baseTag,
                    outboundTag,
                    listenPort,
                    inboundTags,
                    backendPorts,
                    candidates,
                    output
                });
            }));
        };

        registerRoundRobinNodes();

        const mapTag = (tag) => {
            if (!tag) return tag;
            return rrTagMap.get(tag) || tag;
        };

        const rrCandidateDetour = new Map(); // candidate tag -> mapped output tag
        rrGroups.forEach(g => {
            if (!g.output) return;
            const out = mapTag(g.output);
            g.candidates.forEach(c => {
                const prev = rrCandidateDetour.get(c);
                if (prev && prev !== out) {
                    throw new Error(`Round Robin candidate "${c}" has conflicting outputs.`);
                }
                rrCandidateDetour.set(c, out);
            });
        });

        const pickNextHop = (detours) => {
            if (!Array.isArray(detours)) return null;
            for (const d of detours) {
                if (!d) continue;
                return d;
            }
            return null;
        };

        (state?.layers || []).forEach(l => l.nodes.forEach(n => {
            const def = (typeof resolveNodeDefinition === 'function' ? resolveNodeDefinition(n) : null) || n;
            const tag = def.tag || n.tag;
            if (!tag) return;
            usedTags.add(tag);
            const type = def.type || n.type;
            if (type === 'roundrobin') return;

            const detours = Array.isArray(n.detours) ? n.detours.filter(Boolean).map(mapTag) : [];
            const isSelectorLike = type === 'selector' || type === 'urltest';

            let o = outboundMap.get(tag);
            if (!o) {
                o = { type, tag };
                if (def.server) o.server = def.server;
                if (def.port) o.server_port = def.port;
                if (def.password) o.password = def.password;
                if (def.uuid) o.uuid = def.uuid;
                if (def.method) o.method = def.method;
                if (def.tls) o.tls = def.tls;
                outboundMap.set(tag, o);
            }

            const rrOut = rrCandidateDetour.get(tag);
            if (rrOut) {
                if (isSelectorLike) {
                    throw new Error(`Round Robin output chaining does not support candidate "${tag}" of type "${type}".`);
                }
                delete o.outbounds;
                delete o.default;
                o.detour = rrOut;
                return;
            }

            if (detours.length > 0 && isSelectorLike) {
                const merged = new Set(o.outbounds || []);
                detours.forEach(d => merged.add(d));
                o.outbounds = Array.from(merged);
                if (!o.default && o.outbounds.length > 0) {
                    o.default = o.outbounds[0];
                }
                delete o.detour;
            } else {
                delete o.outbounds;
                delete o.default;
                const nextHop = pickNextHop(detours);
                if (nextHop) {
                    // 检查 nextHop 是否是合理的 detour 目标
                    // 获取目标节点的类型定义
                    const getTargetType = (targetTag) => {
                        // 首先检查是否在当前 layers 中定义
                        for (const layer of layers) {
                            for (const node of layer.nodes || []) {
                                if (node.tag === targetTag) {
                                    const def = (typeof resolveNodeDefinition === 'function' ? resolveNodeDefinition(node) : null) || node;
                                    return def.type || node.type;
                                }
                            }
                        }
                        // 然后检查 nodeLibrary
                        const libNode = state.nodeLibrary?.find(n => n.tag === targetTag);
                        if (libNode) {
                            return libNode.type;
                        }
                        return null;
                    };

                    const nextHopType = getTargetType(nextHop);
                    const nonDetourableTypes = ['direct', 'block'];

                    // 对于协议出站（如 hysteria2, vmess, vless 等），不允许 detour 到 direct/block
                    if (nonDetourableTypes.includes(nextHopType) &&
                        type !== 'selector' && type !== 'urltest') {
                        // 不设置 detour，而是通过路由规则来处理
                        delete o.detour;
                    } else {
                        o.detour = nextHop;
                    }
                } else {
                    delete o.detour;
                }
            }
        }));

        rrGroups.forEach(g => {
            outboundMap.set(g.outboundTag, {
                type: 'socks',
                tag: g.outboundTag,
                server: '127.0.0.1',
                server_port: g.listenPort,
                version: '5'
            });
        });

        const outbounds = Array.from(outboundMap.values());

        if (!usedTags.has('direct') && !outbounds.find(o => o.tag === 'direct')) {
            outbounds.push({ type: 'direct', tag: 'direct' });
        }

        const routeRules = [];
        if (state?.inbounds) {
            state.inbounds.forEach(ib => {
                inbounds.push({
                    type: 'mixed',
                    tag: ib.tag,
                    listen: '127.0.0.1',
                    listen_port: ib.port,
                    sniff: true
                });

                const detours = Array.isArray(ib.detours) ? ib.detours.filter(Boolean).map(mapTag) : [];
                if (detours.length > 0) {
                    const firstDetour = detours[0];

                    if (detours.length > 1) {
                        const selectorTag = `${ib.tag}-selector`;
                        const defaultCandidate = ib.selectorDefault ? mapTag(ib.selectorDefault) : null;
                        const selectorDefault =
                            defaultCandidate && detours.includes(defaultCandidate)
                                ? defaultCandidate
                                : firstDetour;

                        outbounds.push({
                            type: 'selector',
                            tag: selectorTag,
                            outbounds: detours,
                            default: selectorDefault
                        });

                        routeRules.push({
                            inbound: [ib.tag],
                            outbound: selectorTag
                        });
                    } else {
                        routeRules.push({
                            inbound: [ib.tag],
                            outbound: firstDetour
                        });
                    }
                }
            });
        }

        rrGroups.forEach(g => {
            g.inboundTags.forEach((inTag, i) => {
                inbounds.push({
                    type: 'socks',
                    tag: inTag,
                    listen: '127.0.0.1',
                    listen_port: g.backendPorts[i]
                });

                const target = mapTag(g.candidates[i]);
                if (!target) return;
                routeRules.push({
                    inbound: [inTag],
                    outbound: target
                });
            });
        });

        return {
            log: { level: "info", timestamp: true },
            inbounds,
            outbounds,
            route: {
                rules: [
                    { protocol: "dns", action: "hijack-dns" },
                    ...routeRules
                ]
            }
        };
    }

    window.ChainCore = {
        sanitizeInboundDefaults,
        buildSingboxConfig
    };
})();
