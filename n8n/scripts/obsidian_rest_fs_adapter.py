#!/usr/bin/env python3
import argparse
import json
import os
import posixpath
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def normalize_rel_path(raw_path: str) -> str:
  parsed = urllib.parse.urlparse(raw_path)
  path = urllib.parse.unquote(parsed.path)
  if not path.startswith('/vault/'):
    return ''
  rel = path[len('/vault/'):]
  # normalize and prevent directory traversal
  rel = posixpath.normpath('/' + rel).lstrip('/')
  if rel.startswith('..') or '/..' in rel:
    return ''
  return rel


class VaultHandler(BaseHTTPRequestHandler):
  server_version = 'ObsidianFsAdapter/1.0'

  def _write(self, code: int, body: bytes = b'', content_type: str = 'text/plain; charset=utf-8'):
    self.send_response(code)
    self.send_header('Content-Type', content_type)
    self.send_header('Content-Length', str(len(body)))
    self.end_headers()
    if body:
      self.wfile.write(body)

  def _auth_ok(self) -> bool:
    expected = self.server.api_key  # type: ignore[attr-defined]
    if not expected:
      return True
    auth = self.headers.get('Authorization', '')
    return auth == f'Bearer {expected}'

  def _abs_path(self):
    rel = normalize_rel_path(self.path)
    if not rel:
      return None
    root: Path = self.server.vault_root  # type: ignore[attr-defined]
    abs_path = (root / rel).resolve()
    try:
      abs_path.relative_to(root.resolve())
    except ValueError:
      return None
    return abs_path

  def do_GET(self):
    if not self._auth_ok():
      self._write(401, b'Unauthorized')
      return
    abs_path = self._abs_path()
    if abs_path is None:
      self._write(404, b'Not found')
      return
    if not abs_path.exists() or not abs_path.is_file():
      self._write(404, b'Not found')
      return
    try:
      data = abs_path.read_bytes()
    except OSError as exc:
      self._write(500, str(exc).encode('utf-8', errors='ignore'))
      return
    ctype = 'application/json; charset=utf-8' if abs_path.suffix == '.json' else 'text/markdown; charset=utf-8'
    self._write(200, data, ctype)

  def do_PUT(self):
    if not self._auth_ok():
      self._write(401, b'Unauthorized')
      return
    abs_path = self._abs_path()
    if abs_path is None:
      self._write(404, b'Not found')
      return
    try:
      length = int(self.headers.get('Content-Length', '0'))
    except ValueError:
      self._write(400, b'Invalid Content-Length')
      return
    body = self.rfile.read(max(0, length))
    try:
      abs_path.parent.mkdir(parents=True, exist_ok=True)
      abs_path.write_bytes(body)
    except OSError as exc:
      self._write(500, str(exc).encode('utf-8', errors='ignore'))
      return
    self._write(200, b'OK')

  def do_POST(self):
    if self.path.rstrip('/') == '/healthz':
      payload = json.dumps({'ok': True}).encode('utf-8')
      self._write(200, payload, 'application/json; charset=utf-8')
      return
    self._write(405, b'Method not allowed')

  def log_message(self, fmt, *args):
    # concise single-line logs
    self.server.logger_lock.acquire()  # type: ignore[attr-defined]
    try:
      print(f"{self.address_string()} {self.command} {self.path} -> {fmt % args}")
    finally:
      self.server.logger_lock.release()  # type: ignore[attr-defined]


def main():
  parser = argparse.ArgumentParser(description='Filesystem-backed Obsidian REST adapter')
  parser.add_argument('--vault-root', required=True)
  parser.add_argument('--api-key', default='')
  parser.add_argument('--host', default='127.0.0.1')
  parser.add_argument('--port', type=int, default=27124)
  args = parser.parse_args()

  vault_root = Path(args.vault_root).expanduser().resolve()
  if not vault_root.exists() or not vault_root.is_dir():
    raise SystemExit(f'vault root missing: {vault_root}')

  server = ThreadingHTTPServer((args.host, args.port), VaultHandler)
  server.vault_root = vault_root  # type: ignore[attr-defined]
  server.api_key = args.api_key  # type: ignore[attr-defined]
  server.logger_lock = threading.Lock()  # type: ignore[attr-defined]

  print(f'Obsidian FS adapter serving {vault_root} on http://{args.host}:{args.port}')
  server.serve_forever()


if __name__ == '__main__':
  main()
