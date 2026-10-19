"""Optional, loopback-only speech service. No remote model API or automatic downloads."""
import hashlib
import hmac
import importlib.util
import json
import math
import os
from pathlib import Path
import secrets
import tempfile
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE = "/api/transcription"
MAX_BYTES = 256 * 1024 * 1024
MAX_PART = 256 * 1024
MIMES = {"audio/mp4": ".m4a", "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/wav": ".wav"}


class ApiError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


class Service:
    def __init__(self, password, origin, model_dir=None, transcriber=None):
        if not 16 <= len(password) <= 256:
            raise ValueError("NOTEPAD_ASR_PASSWORD must contain 16–256 characters")
        parsed = urlparse(origin)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise ValueError("NOTEPAD_ASR_ORIGIN must be an exact origin without path")
        if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
            raise ValueError("Public origin requires HTTPS")
        self.origin, self.secure = origin, parsed.scheme == "https"
        self.salt = secrets.token_bytes(16)
        self.password = hashlib.scrypt(password.encode(), salt=self.salt, n=16384, r=8, p=1)
        self.model_dir = Path(model_dir).resolve() if model_dir else None
        self.transcriber, self.model = transcriber, None
        self.root = Path(tempfile.mkdtemp(prefix="my-notepad-asr-")).resolve()
        self.sessions, self.jobs, self.logins, self.runs = {}, {}, [], []
        self.lock = threading.RLock()

    def configured(self):
        return bool(self.transcriber or (self.model_dir and all((self.model_dir / name).is_file() for name in ('model.bin', 'config.json', 'tokenizer.json')) and importlib.util.find_spec("faster_whisper")))

    def login(self, password):
        with self.lock:
            now = time.time()
            self.logins = [t for t in self.logins if now - t < 900]
            if len(self.logins) >= 10:
                raise ApiError(429, "login_limited")
            self.logins.append(now)
            candidate = hashlib.scrypt(password.encode(), salt=self.salt, n=16384, r=8, p=1)
            if not hmac.compare_digest(candidate, self.password):
                raise ApiError(401, "unauthorized")
            self.sessions = {token: expiry for token, expiry in self.sessions.items() if expiry > now}
            token = secrets.token_urlsafe(32)
            self.sessions[token] = now + 8 * 3600
            return token

    def authenticate(self, cookie):
        jar = SimpleCookie()
        try:
            jar.load(cookie or "")
        except Exception:
            raise ApiError(401, "unauthorized")
        token = jar.get("notepad_asr")
        token = token.value if token else None
        if not token or self.sessions.get(token, 0) <= time.time():
            raise ApiError(401, "unauthorized")
        return token

    def logout(self, token):
        with self.lock:
            self.sessions.pop(token, None)

    def create_job(self, meta):
        with self.lock:
            if not self.configured():
                raise ApiError(503, "model_not_configured")
            now = time.time()
            for identifier, old in list(self.jobs.items()):
                if old["state"] == "uploading" and now - old["created"] > 1800:
                    old["state"] = "cancelled"
                    self.remove_source(old)
                if old.get('finished', now) < now - 86400:
                    self.jobs.pop(identifier, None)
            if any(j["state"] in ("uploading", "running") or j.get('workerActive') for j in self.jobs.values()):
                raise ApiError(409, "busy")
            self.runs = [t for t in self.runs if now - t < 3600]
            if len(self.runs) >= 6:
                raise ApiError(429, "job_limited")
            mime = str(meta.get("mime", "")).split(";")[0]
            size, chunks = meta.get("bytes"), meta.get("chunks")
            if mime not in MIMES or type(size) is not int or not 0 < size <= MAX_BYTES or type(chunks) is not int or not 0 < chunks <= 20000:
                raise ApiError(400, "invalid_audio")
            identifier = secrets.token_hex(16)
            directory = self.root / identifier
            directory.mkdir(mode=0o700)
            job = {"id": identifier, "state": "uploading", "expected": size, "count": chunks, "bytes": 0, "hashes": [], "created": now, "path": directory / ("audio" + MIMES[mime]), "seconds": 0, "segments": []}
            self.jobs[identifier] = job
            self.runs.append(now)
            return job

    def find(self, identifier):
        job = self.jobs.get(identifier)
        if not job:
            raise ApiError(404, "job_not_found")
        return job

    def upload(self, job, index, body):
        with self.lock:
            if job["state"] != "uploading" or not body:
                raise ApiError(409, "invalid_state")
            digest = hashlib.sha256(body).hexdigest()
            if index < len(job["hashes"]):
                if job["hashes"][index] == digest:
                    return
                raise ApiError(409, "chunk_conflict")
            if index != len(job["hashes"]) or index >= job["count"] or job["bytes"] + len(body) > job["expected"]:
                raise ApiError(409, "chunk_order")
            with open(job["path"], "r+b" if job['path'].exists() else "w+b") as source:
                source.seek(job['bytes'])
                source.truncate()
                source.write(body)
                source.flush()
            job["bytes"] += len(body)
            job["hashes"].append(digest)

    def run(self, job):
        with self.lock:
            if job["state"] != "uploading" or job["bytes"] != job["expected"] or len(job["hashes"]) != job["count"]:
                raise ApiError(409, "incomplete_upload")
            job["state"] = "running"
            job['workerActive'] = True
        threading.Thread(target=self.process, args=(job,), daemon=True).start()

    def process(self, job):
        result, final_state = [], 'failed'
        try:
            segments = self.transcriber(job["path"]) if self.transcriber else self.whisper(job["path"])
            length = 0
            for segment in segments:
                if job["state"] == "cancelled":
                    return
                start, end, text = float(segment["start"]), float(segment["end"]), str(segment["text"])
                length += len(text)
                if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start or end > 14400 or length > 1000000:
                    raise ValueError("Invalid transcription limits")
                result.append({"start": start, "end": end, "text": text})
                job["seconds"] = end
            final_state = 'complete'
        except Exception:
            final_state = 'failed'
        finally:
            self.remove_source(job)
            with self.lock:
                if job['state'] != 'cancelled':
                    job['segments'], job['state'] = result if final_state == 'complete' else [], final_state
                job['workerActive'], job['finished'] = False, time.time()

    def whisper(self, path):
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        from faster_whisper import WhisperModel
        if self.model is None:
            self.model = WhisperModel(str(self.model_dir), device="cpu", compute_type="int8", local_files_only=True)
        segments, info = self.model.transcribe(str(path), language="ru", vad_filter=True, beam_size=5)
        if info.language != "ru" or info.duration > 14400:
            raise ValueError("Use a multilingual model and audio below four hours")
        for segment in segments:
            yield {"start": segment.start, "end": segment.end, "text": segment.text}

    def remove_source(self, job):
        with self.lock:
            if not job['path'].parent.exists():
                return
            path = job["path"].resolve()
            if path.parent.parent != self.root.resolve() or path.name not in {"audio" + suffix for suffix in MIMES.values()}:
                raise ValueError("Unsafe temporary path")
            try:
                path.unlink(missing_ok=True)
                path.parent.rmdir()
            except OSError:
                pass

    def cancel(self, job):
        with self.lock:
            running = bool(job.get('workerActive'))
            job["state"] = "cancelled"
            job['segments'], job['hashes'] = [], []
            if not running:
                job['finished'] = time.time()
                self.remove_source(job)

    @staticmethod
    def public(job):
        result = {k: job[k] for k in ("id", "state", "bytes", "seconds")}
        result['uploadedChunks'] = len(job['hashes'])
        if job["state"] == "complete":
            result["segments"] = job["segments"]
        return result


def handler(service):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, payload, cookie=None):
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if cookie:
                self.send_header("Set-Cookie", cookie)
            self.end_headers()
            self.wfile.write(body)

        def body(self, maximum):
            self.connection.settimeout(30)
            try:
                size = int(self.headers.get("Content-Length", "-1"))
            except ValueError:
                raise ApiError(400, "invalid_length")
            if not 0 <= size <= maximum:
                if size>0:
                    self.rfile.read(min(size, maximum+1))
                raise ApiError(413, "too_large")
            body = self.rfile.read(size)
            if len(body) != size:
                raise ApiError(400, "incomplete_body")
            return body

        def json_body(self):
            if not self.headers.get("Content-Type", "").startswith("application/json"):
                raise ApiError(415, "json_required")
            value = json.loads(self.body(2048))
            if not isinstance(value, dict):
                raise ApiError(400, "invalid_json")
            return value

        def dispatch(self):
            try:
                path = urlparse(self.path).path
                if self.command in ("POST", "PUT", "DELETE") and self.headers.get("Origin") != service.origin:
                    raise ApiError(403, "origin_rejected")
                if self.command == "POST" and path == BASE + "/login":
                    password = self.json_body().get("password", "")
                    if not isinstance(password, str) or len(password) > 256:
                        raise ApiError(400, "invalid_password")
                    token = service.login(password)
                    self.reply(200, {"ok": True}, "notepad_asr=" + token + "; Path=" + BASE + "; HttpOnly; SameSite=Strict; Max-Age=28800" + ("; Secure" if service.secure else ""))
                    return
                token = service.authenticate(self.headers.get("Cookie"))
                if self.command == "POST" and path == BASE + "/logout":
                    service.logout(token)
                    self.reply(200, {"ok": True}, "notepad_asr=; Path=" + BASE + "; HttpOnly; SameSite=Strict; Max-Age=0")
                elif self.command == "GET" and path == BASE + "/status":
                    self.reply(200, {"configured": service.configured(), "provider": "local-faster-whisper", "maxBytes": MAX_BYTES, "maxDuration": 14400})
                elif self.command == "POST" and path == BASE + "/jobs":
                    self.reply(201, service.public(service.create_job(self.json_body())))
                elif path.startswith(BASE + "/jobs/"):
                    parts = path[len(BASE + "/jobs/"):].split("/")
                    job = service.find(parts[0])
                    if self.command == "GET" and len(parts) == 1:
                        self.reply(200, service.public(job))
                    elif self.command == "DELETE" and len(parts) == 1:
                        service.cancel(job)
                        self.reply(200, {"ok": True})
                    elif self.command == "POST" and parts[1:] == ["run"]:
                        service.run(job)
                        self.reply(202, service.public(job))
                    elif self.command == "PUT" and len(parts) == 3 and parts[1] == "chunks" and parts[2].isdigit():
                        service.upload(job, int(parts[2]), self.body(MAX_PART))
                        self.reply(200, service.public(job))
                    else:
                        raise ApiError(404, "not_found")
                else:
                    raise ApiError(404, "not_found")
            except ApiError as error:
                self.reply(error.status, {"error": error.code})
            except (ValueError, TypeError, json.JSONDecodeError):
                self.reply(400, {"error": "invalid_request"})
            except Exception:
                self.reply(500, {"error": "server_error"})

        do_GET = do_POST = do_PUT = do_DELETE = dispatch
    return Handler


if __name__ == "__main__":
    service = Service(os.environ.get("NOTEPAD_ASR_PASSWORD", ""), os.environ.get("NOTEPAD_ASR_ORIGIN", ""), os.environ.get("NOTEPAD_ASR_MODEL_DIR"))
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("NOTEPAD_ASR_PORT", "8091"))), handler(service))
    print("Local speech service listening on loopback. Audio is never forwarded to a cloud API.")
    server.serve_forever()
