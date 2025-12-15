import json
import socket
import socketserver
import select
import threading


class RRProxyManager:
    RR_PREFIX = 'sys-rr-'
    RR_OUT_SUFFIX = '-lb'
    RR_IN_MARK = '-in-'

    def __init__(self):
        self._lock = threading.Lock()
        self._servers = {}  # group_id -> (server, thread)

    @staticmethod
    def _recv_exact(sock_obj, n):
        buf = b""
        while len(buf) < n:
            chunk = sock_obj.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("Unexpected EOF")
            buf += chunk
        return buf

    @staticmethod
    def _read_socks_addr(sock_obj, atyp):
        if atyp == 1:  # IPv4
            data = RRProxyManager._recv_exact(sock_obj, 4)
            return data
        if atyp == 3:  # Domain
            ln = RRProxyManager._recv_exact(sock_obj, 1)[0]
            data = RRProxyManager._recv_exact(sock_obj, ln)
            return bytes([ln]) + data
        if atyp == 4:  # IPv6
            data = RRProxyManager._recv_exact(sock_obj, 16)
            return data
        raise ValueError("Unsupported ATYP")

    @staticmethod
    def _consume_socks_addr(sock_obj, atyp):
        RRProxyManager._read_socks_addr(sock_obj, atyp)

    @staticmethod
    def _send_socks_reply(sock_obj, rep):
        sock_obj.sendall(b"\x05" + bytes([rep]) + b"\x00\x01\x00\x00\x00\x00\x00\x00")

    @staticmethod
    def _relay_tcp(a, b):
        try:
            a.settimeout(None)
            b.settimeout(None)
            while True:
                r, _, _ = select.select([a, b], [], [])
                for s in r:
                    data = s.recv(65536)
                    if not data:
                        return
                    (b if s is a else a).sendall(data)
        except Exception:
            return

    @classmethod
    def _extract_groups(cls, config):
        outbounds = config.get("outbounds") or []
        inbounds = config.get("inbounds") or []

        listen_ports = {}
        for o in outbounds:
            if not isinstance(o, dict):
                continue
            tag = o.get("tag")
            if not isinstance(tag, str):
                continue
            if not tag.startswith(cls.RR_PREFIX) or not tag.endswith(cls.RR_OUT_SUFFIX):
                continue
            if o.get("type") != "socks":
                continue
            if o.get("server") != "127.0.0.1":
                continue
            port = o.get("server_port")
            if not isinstance(port, int):
                continue
            group_id = tag[len(cls.RR_PREFIX):-len(cls.RR_OUT_SUFFIX)]
            listen_ports[group_id] = port

        backend_ports = {}
        for ib in inbounds:
            if not isinstance(ib, dict):
                continue
            tag = ib.get("tag")
            if not isinstance(tag, str):
                continue
            if not tag.startswith(cls.RR_PREFIX):
                continue
            if ib.get("type") != "socks":
                continue
            rest = tag[len(cls.RR_PREFIX):]
            if cls.RR_IN_MARK not in rest:
                continue
            group_id, idx_str = rest.rsplit(cls.RR_IN_MARK, 1)
            try:
                idx = int(idx_str)
            except ValueError:
                continue
            port = ib.get("listen_port")
            if not isinstance(port, int):
                continue
            backend_ports.setdefault(group_id, []).append((idx, port))

        groups = []
        for group_id, listen_port in listen_ports.items():
            backends = backend_ports.get(group_id) or []
            backends.sort(key=lambda x: x[0])
            ports = [p for _, p in backends]
            if len(ports) < 2:
                continue
            groups.append({"id": group_id, "listen_port": listen_port, "backend_ports": ports})

        return groups

    @staticmethod
    def _make_handler(backend_ports):
        ports = list(backend_ports)
        lock = threading.Lock()
        state = {"i": 0}

        def pick_backend():
            with lock:
                i = state["i"]
                state["i"] = (i + 1) % len(ports)
                return ports[i]

        class Handler(socketserver.BaseRequestHandler):
            def handle(self):
                client = self.request
                upstream = None
                try:
                    client.settimeout(10)

                    hdr = RRProxyManager._recv_exact(client, 2)
                    if hdr[0] != 5:
                        return
                    nmethods = hdr[1]
                    RRProxyManager._recv_exact(client, nmethods)
                    client.sendall(b"\x05\x00")

                    req = RRProxyManager._recv_exact(client, 4)
                    if req[0] != 5:
                        return
                    cmd = req[1]
                    atyp = req[3]
                    if cmd != 1:
                        RRProxyManager._send_socks_reply(client, 7)
                        return

                    addr_raw = RRProxyManager._read_socks_addr(client, atyp)
                    port_raw = RRProxyManager._recv_exact(client, 2)

                    backend_port = pick_backend()
                    upstream = socket.create_connection(("127.0.0.1", backend_port), timeout=10)

                    upstream.sendall(b"\x05\x01\x00")
                    resp = RRProxyManager._recv_exact(upstream, 2)
                    if resp[0] != 5 or resp[1] != 0:
                        RRProxyManager._send_socks_reply(client, 1)
                        return

                    upstream.sendall(b"\x05\x01\x00" + bytes([atyp]) + addr_raw + port_raw)
                    rep = RRProxyManager._recv_exact(upstream, 4)
                    if rep[0] != 5:
                        RRProxyManager._send_socks_reply(client, 1)
                        return
                    if rep[1] != 0:
                        RRProxyManager._send_socks_reply(client, rep[1])
                        return
                    RRProxyManager._consume_socks_addr(upstream, rep[3])
                    RRProxyManager._recv_exact(upstream, 2)

                    RRProxyManager._send_socks_reply(client, 0)
                    RRProxyManager._relay_tcp(client, upstream)
                except Exception:
                    return
                finally:
                    try:
                        if upstream:
                            upstream.close()
                    except Exception:
                        pass

        return Handler

    def stop_all(self):
        with self._lock:
            servers = list(self._servers.values())
            self._servers.clear()
        for server, _thread in servers:
            try:
                server.shutdown()
            except Exception:
                pass
            try:
                server.server_close()
            except Exception:
                pass

    def start_from_config(self, config_path):
        self.stop_all()

        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)

        groups = self._extract_groups(config)
        if not groups:
            return []

        started = []
        try:
            for g in groups:
                listen_port = g["listen_port"]
                backend_ports = g["backend_ports"]
                handler = self._make_handler(backend_ports)
                server = socketserver.ThreadingTCPServer(("127.0.0.1", listen_port), handler)
                server.daemon_threads = True
                t = threading.Thread(target=server.serve_forever, daemon=True)
                t.start()
                started.append((g["id"], server, t))
        except Exception:
            for _gid, server, _t in started:
                try:
                    server.shutdown()
                except Exception:
                    pass
                try:
                    server.server_close()
                except Exception:
                    pass
            raise

        with self._lock:
            for gid, server, t in started:
                self._servers[gid] = (server, t)

        return groups