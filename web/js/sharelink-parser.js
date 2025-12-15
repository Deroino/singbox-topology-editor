// Share Link Parser - Adapted from https://github.com/4n0nymou3/proxy-to-singbox-converter
// Supports: vmess://, vless://, trojan://, hysteria2://, ss://

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function parseVmessLink(input) {
    try {
        const data = JSON.parse(atob(input.replace('vmess://', '')));
        if (!data.add || !data.port || !data.id) throw new Error('Missing required fields');

        const result = {
            id: 'lib-' + Date.now(),
            tag: data.ps || `vmess-${data.add}:${data.port}`,
            type: 'vmess',
            server: data.add,
            port: parseInt(data.port),
            uuid: data.id,
            alter_id: parseInt(data.aid || 0),
            security: data.scy || 'auto'
        };

        if (data.net === 'ws') {
            result.transport = {
                type: 'ws',
                path: data.path || '/',
                headers: { Host: data.host || data.add }
            };
        }

        if (data.tls === 'tls') {
            result.tls = {
                enabled: true,
                server_name: data.sni || data.add,
                insecure: false
            };
        }

        return result;
    } catch (error) {
        throw new Error('Invalid VMess link: ' + error.message);
    }
}

function parseVlessLink(input) {
    try {
        const url = new URL(input);
        if (url.protocol.toLowerCase() !== 'vless:' || !url.hostname) {
            throw new Error('Invalid protocol or hostname');
        }

        const params = new URLSearchParams(url.search);
        const remark = decodeURIComponent(url.hash.slice(1)) || `vless-${url.hostname}:${url.port}`;

        const result = {
            id: 'lib-' + Date.now(),
            tag: remark,
            type: 'vless',
            server: url.hostname,
            port: parseInt(url.port || 443),
            uuid: url.username,
            flow: params.get('flow') || ''
        };

        if (params.get('type') === 'ws') {
            result.transport = {
                type: 'ws',
                path: params.get('path') || '/',
                headers: { Host: params.get('host') || url.hostname }
            };
        }

        const tls_enabled = params.get('security') === 'tls' || [443, 2053, 2083, 2087, 2096, 8443].includes(result.port);
        if (tls_enabled) {
            result.tls = {
                enabled: true,
                server_name: params.get('sni') || url.hostname,
                insecure: false
            };
        }

        return result;
    } catch (error) {
        throw new Error('Invalid VLESS link: ' + error.message);
    }
}

function parseTrojanLink(input) {
    try {
        const url = new URL(input);
        if (url.protocol.toLowerCase() !== 'trojan:' || !url.hostname) {
            throw new Error('Invalid protocol or hostname');
        }

        const params = new URLSearchParams(url.search);
        const remark = decodeURIComponent(url.hash.slice(1)) || `trojan-${url.hostname}:${url.port}`;

        const result = {
            id: 'lib-' + Date.now(),
            tag: remark,
            type: 'trojan',
            server: url.hostname,
            port: parseInt(url.port || 443),
            password: url.username,
            tls: {
                enabled: true,
                server_name: params.get('sni') || url.hostname,
                insecure: false
            }
        };

        if (params.get('type') === 'ws') {
            result.transport = {
                type: 'ws',
                path: params.get('path') || '/',
                headers: { Host: params.get('host') || url.hostname }
            };
        }

        return result;
    } catch (error) {
        throw new Error('Invalid Trojan link: ' + error.message);
    }
}

function parseHysteria2Link(input) {
    try {
        const url = new URL(input);
        if (!['hysteria2:', 'hy2:'].includes(url.protocol.toLowerCase()) || !url.hostname || !url.port) {
            throw new Error('Invalid protocol, hostname, or port');
        }

        const params = new URLSearchParams(url.search);
        const remark = decodeURIComponent(url.hash.slice(1)) || `hy2-${url.hostname}:${url.port}`;

        return {
            id: 'lib-' + Date.now(),
            tag: remark,
            type: 'hysteria2',
            server: url.hostname,
            port: parseInt(url.port),
            password: url.username || params.get('password') || '',
            tls: {
                enabled: true,
                server_name: params.get('sni') || url.hostname,
                insecure: true
            }
        };
    } catch (error) {
        throw new Error('Invalid Hysteria2 link: ' + error.message);
    }
}

function parseShadowsocksLink(input) {
    try {
        const url = new URL(input);
        if (url.protocol.toLowerCase() !== 'ss:') {
            throw new Error('Invalid protocol');
        }

        const server = url.hostname;
        const port = parseInt(url.port);

        if (!server || !port || isNaN(port)) {
            throw new Error('Missing server or port');
        }

        const decodedUserInfo = atob(url.username);
        const userInfoParts = decodedUserInfo.split(':');
        if (userInfoParts.length !== 2) {
            throw new Error('Invalid user info format');
        }

        const method = userInfoParts[0];
        const password = userInfoParts[1];

        if (!method || !password) {
            throw new Error('Missing method or password');
        }

        const remark = decodeURIComponent(url.hash.slice(1)) || `ss-${server}:${port}`;

        return {
            id: 'lib-' + Date.now(),
            tag: remark,
            type: 'shadowsocks',
            server: server,
            port: port,
            method: method,
            password: password
        };
    } catch (error) {
        throw new Error('Invalid Shadowsocks link: ' + error.message);
    }
}

function parseShareLink(line) {
    line = line.trim();
    if (!line) return null;

    if (line.startsWith('vmess://')) return parseVmessLink(line);
    if (line.startsWith('vless://')) return parseVlessLink(line);
    if (line.startsWith('trojan://')) return parseTrojanLink(line);
    if (line.startsWith('hysteria2://') || line.startsWith('hy2://')) return parseHysteria2Link(line);
    if (line.startsWith('ss://')) return parseShadowsocksLink(line);

    throw new Error('Unsupported protocol');
}

function extractLinksFromText(text) {
    const links = [];
    const patterns = [
        /(?:^|[^a-z])vmess:\/\/[^\s]+/gi,
        /(?:^|[^a-z])vless:\/\/[^\s]+/gi,
        /(?:^|[^a-z])trojan:\/\/[^\s]+/gi,
        /(?:^|[^a-z])hysteria2:\/\/[^\s]+/gi,
        /(?:^|[^a-z])hy2:\/\/[^\s]+/gi,
        /(?:^|[^a-z])ss:\/\/[^\s]+/gi
    ];

    patterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
            // Remove leading non-letter character if present
            const cleaned = matches.map(m => m.replace(/^[^a-z]+/i, ''));
            links.push(...cleaned);
        }
    });

    return [...new Set(links)];
}

function importShareLinks(text, existingLibrary) {
    let lines;

    try {
        const decoded = atob(text.trim());
        lines = decoded.split('\n');
    } catch {
        lines = text.split('\n');
    }

    const allText = lines.join(' ');
    const links = extractLinksFromText(allText);

    const results = { success: [], failed: [] };
    const usedTags = new Set(existingLibrary.map(n => n.tag));

    links.forEach(link => {
        try {
            const node = parseShareLink(link);

            let tag = node.tag;
            let suffix = 1;
            while (usedTags.has(tag)) {
                tag = `${node.tag}-${suffix++}`;
            }
            node.tag = tag;
            usedTags.add(tag);

            results.success.push(node);
        } catch (e) {
            results.failed.push({ link: link.substring(0, 50) + '...', error: e.message });
        }
    });

    return results;
}
