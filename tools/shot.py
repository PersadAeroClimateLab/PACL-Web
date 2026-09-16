#!/usr/bin/env python3
"""Render a page in headless Chromium and write a PNG.

`chromium --screenshot` captures through a path that does not wait for the
WebGL compositor, so a canvas often lands in the file as black. This drives
the DevTools Protocol instead, which is what Puppeteer does: attach first,
navigate, wait for real time to pass, then ask the compositor for the frame.

It also returns the console output, so one run gives both the picture and the
log.

    python3 tools/shot.py http://localhost:5173/ -o shot.png -s 1300x850
    python3 tools/shot.py URL -o out.png --wait 'window.ready === true'

No dependencies. The WebSocket client below is the small part of RFC 6455
that the protocol needs.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import random
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


# --- the smallest WebSocket client that works -----------------------------


class WebSocket:
    def __init__(self, url: str, timeout: float = 30.0):
        rest = url.removeprefix("ws://")
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=timeout)
        self.sock.settimeout(timeout)
        key = base64.b64encode(bytes(random.getrandbits(8) for _ in range(16))).decode()
        self.sock.sendall(
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {hostport}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n".encode()
        )
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("the browser closed the connection")
            buf += chunk
        if b" 101 " not in buf.split(b"\r\n")[0]:
            raise ConnectionError(f"handshake refused: {buf.split(b'\r\n')[0]!r}")
        self.rest = buf.split(b"\r\n\r\n", 1)[1]

    def _read(self, n: int) -> bytes:
        while len(self.rest) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("the browser closed the connection")
            self.rest += chunk
        out, self.rest = self.rest[:n], self.rest[n:]
        return out

    def send(self, text: str) -> None:
        payload = text.encode()
        header = bytearray([0x81])
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 1 << 16:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = bytes(random.getrandbits(8) for _ in range(4))
        header += mask
        self.sock.sendall(
            bytes(header) + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        )

    def recv(self) -> str:
        chunks = []
        while True:
            b0, b1 = self._read(2)
            fin, opcode = b0 & 0x80, b0 & 0x0F
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            data = self._read(n) if n else b""
            if opcode == 0x8:  # close
                raise ConnectionError("the browser closed the connection")
            if opcode == 0x9:  # ping
                self.sock.sendall(b"\x8a\x00")
                continue
            chunks.append(data)
            if fin:
                return b"".join(chunks).decode("utf-8", "replace")

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


# --- DevTools ---------------------------------------------------------------


class Devtools:
    def __init__(self, ws_url: str):
        self.ws = WebSocket(ws_url)
        self.next_id = 0
        self.events: list[dict] = []

    def call(self, method: str, params: dict | None = None, timeout: float = 60.0):
        self.next_id += 1
        wanted = self.next_id
        self.ws.send(json.dumps({"id": wanted, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            message = json.loads(self.ws.recv())
            if message.get("id") == wanted:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})
            if "method" in message:
                self.events.append(message)
        raise TimeoutError(f"{method} did not answer")

    def drain(self, seconds: float) -> None:
        """Collect events for a while, so the page can actually run."""
        end = time.time() + seconds
        self.ws.sock.settimeout(0.25)
        while time.time() < end:
            try:
                message = json.loads(self.ws.recv())
            except (TimeoutError, socket.timeout):
                continue
            except ConnectionError:
                break
            if "method" in message:
                self.events.append(message)
        self.ws.sock.settimeout(30.0)


def console_lines(events: list[dict]) -> list[str]:
    out = []
    for event in events:
        if event.get("method") == "Runtime.consoleAPICalled":
            params = event["params"]
            text = " ".join(
                str(a.get("value", a.get("description", "")))
                for a in params.get("args", [])
            )
            out.append(f"[{params.get('type', 'log')}] {text}")
        elif event.get("method") == "Runtime.exceptionThrown":
            detail = event["params"]["exceptionDetails"]
            text = detail.get("exception", {}).get("description") or detail.get("text")
            out.append(f"[error] {text}")
        elif event.get("method") == "Log.entryAdded":
            entry = event["params"]["entry"]
            if entry.get("level") in ("error", "warning"):
                out.append(f"[{entry['level']}] {entry.get('text', '')}")
    return out


def find_browser() -> str:
    for name in ("chromium", "chromium-browser", "google-chrome-stable", "google-chrome"):
        path = shutil.which(name)
        if path:
            return path
    sys.exit("shot: no chromium on PATH")


def main() -> int:
    parser = argparse.ArgumentParser(description="Screenshot a page, WebGL included.")
    parser.add_argument("url")
    parser.add_argument("-o", "--out", default="shot.png")
    parser.add_argument("-s", "--size", default="1280x800", help="WIDTHxHEIGHT")
    parser.add_argument(
        "--settle",
        type=float,
        default=2.5,
        help="seconds of real time to let the render loop run",
    )
    parser.add_argument("--wait", help="poll this JS until it is true, then settle")
    parser.add_argument("--eval", dest="script", help="run this JS once before settling")
    parser.add_argument("--scale", type=float, default=1.0, help="device pixel ratio")
    parser.add_argument("--quiet", action="store_true", help="do not print the console")
    parser.add_argument(
        "--frames", type=int, default=1, help="capture this many screenshots in one run"
    )
    parser.add_argument(
        "--frame-interval",
        type=float,
        default=1.0,
        help="seconds of real time between frames when --frames > 1",
    )
    args = parser.parse_args()

    width, _, height = args.size.partition("x")
    width, height = int(width), int(height)
    port = random.randint(45000, 60000)
    profile = tempfile.mkdtemp(prefix="shot-profile-")

    process = subprocess.Popen(
        [
            find_browser(),
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--use-gl=swiftshader",
            "--enable-unsafe-swiftshader",
            "--hide-scrollbars",
            "--disable-extensions",
            "--no-first-run",
            "--force-device-scale-factor=" + str(args.scale),
            f"--window-size={width},{height}",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={profile}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        target = None
        deadline = time.time() + 25
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/json/list", timeout=1
                ) as response:
                    targets = json.load(response)
                target = next(
                    (t for t in targets if t.get("type") == "page"),
                    None,
                )
                if target and target.get("webSocketDebuggerUrl"):
                    break
            except (urllib.error.URLError, ConnectionError, OSError, json.JSONDecodeError):
                pass
            time.sleep(0.2)
        if not target:
            return fail(process, profile, "the browser never offered a page target")

        cdp = Devtools(target["webSocketDebuggerUrl"])
        cdp.call("Runtime.enable")
        cdp.call("Log.enable")
        cdp.call("Page.enable")
        cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "deviceScaleFactor": args.scale,
                "mobile": False,
            },
        )
        cdp.call("Page.navigate", {"url": args.url})

        # Wait for the load event, then let real frames run. Virtual time is
        # what breaks a requestAnimationFrame loop, so there is none here.
        loaded = time.time() + 30
        while time.time() < loaded:
            if any(e.get("method") == "Page.loadEventFired" for e in cdp.events):
                break
            cdp.drain(0.2)

        if args.wait:
            until = time.time() + 30
            while time.time() < until:
                result = cdp.call(
                    "Runtime.evaluate",
                    {"expression": args.wait, "returnByValue": True},
                )
                if result.get("result", {}).get("value"):
                    break
                cdp.drain(0.25)
            else:
                print("shot: --wait never became true", file=sys.stderr)

        if args.script:
            result = cdp.call(
                "Runtime.evaluate",
                {"expression": args.script, "returnByValue": True, "awaitPromise": True},
            )
            if "exceptionDetails" in result:
                print(f"shot: --eval threw: {result['exceptionDetails']}", file=sys.stderr)

        cdp.drain(args.settle)

        for i in range(args.frames):
            if i > 0:
                cdp.drain(args.frame_interval)
            shot = cdp.call(
                "Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False}
            )
            data = base64.b64decode(shot["data"])
            out_path = frame_path(args.out, i, args.frames)
            with open(out_path, "wb") as handle:
                handle.write(data)
            print(f"shot: {out_path} {len(data)} bytes {width}x{height} @{args.scale}x")

        if not args.quiet:
            for line in console_lines(cdp.events):
                print(line)
        cdp.ws.close()
        return 0
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        shutil.rmtree(profile, ignore_errors=True)


def frame_path(out: str, index: int, total: int) -> str:
    if total <= 1:
        return out
    stem, ext = os.path.splitext(out)
    return f"{stem}-{index}{ext}"


def fail(process, profile, message):
    print(f"shot: {message}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
