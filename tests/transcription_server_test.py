import importlib.util
import json
from pathlib import Path
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location("speech_server", Path(__file__).resolve().parent.parent / "transcription" / "server.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.service = module.Service("test-only-passphrase-123", "http://127.0.0.1:8080", transcriber=lambda path: iter([{"start": 0, "end": 1.5, "text": "Тест транспорта, не ответ модели"}]))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), module.handler(self.service))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = "http://127.0.0.1:" + str(self.server.server_port) + module.BASE
        self.cookie = ""

    def tearDown(self):
        for job in self.service.jobs.values():
            self.service.cancel(job)
            self.service.remove_source(job)
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.service.root.rmdir()

    def call(self, method, path, data=None, origin="http://127.0.0.1:8080", raw=False):
        body = data if raw else json.dumps(data or {}).encode() if method in ("POST", "PUT") else None
        req = urllib.request.Request(self.url + path, data=body, method=method, headers={"Origin": origin, "Cookie": self.cookie, "Content-Type": "application/octet-stream" if raw else "application/json"})
        try:
            response = urllib.request.urlopen(req)
        except urllib.error.HTTPError as error:
            response = error
        cookie = response.headers.get("Set-Cookie")
        if cookie:
            self.cookie = cookie.split(";")[0]
        try:
            return response.status, json.loads(response.read()), cookie
        finally:
            response.close()

    def login(self):
        return self.call("POST", "/login", {"password": "test-only-passphrase-123"})

    def test_auth_and_origin(self):
        self.assertEqual(self.call("GET", "/status")[0], 401)
        self.assertEqual(self.call("POST", "/login", {"password": "wrong"})[0], 401)
        self.assertEqual(self.call("POST", "/login", {"password": "test-only-passphrase-123"}, origin="https://elsewhere.invalid")[0], 403)
        status, _, cookie = self.login()
        self.assertEqual(status, 200)
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        self.assertEqual(self.call("GET", "/status")[0], 200)
        self.call("POST", "/logout")
        self.assertEqual(self.call("GET", "/status")[0], 401)

    def test_missing_model_is_honest(self):
        self.service.transcriber = None
        self.login()
        self.assertFalse(self.call("GET", "/status")[1]["configured"])
        self.assertEqual(self.call("POST", "/jobs", {"mime": "audio/mp4", "bytes": 3, "chunks": 1})[0], 503)

    def test_order_retry_and_result_protocol(self):
        self.login()
        status, job, _ = self.call("POST", "/jobs", {"mime": "audio/mp4", "bytes": 6, "chunks": 2})
        self.assertEqual(status, 201)
        path = "/jobs/" + job["id"]
        self.assertEqual(self.call("PUT", path + "/chunks/1", b"abc", raw=True)[0], 409)
        self.assertEqual(self.call("PUT", path + "/chunks/0", b"abc", raw=True)[0], 200)
        self.assertEqual(self.call("PUT", path + "/chunks/0", b"abc", raw=True)[0], 200)
        self.assertEqual(self.call("PUT", path + "/chunks/0", b"xxx", raw=True)[0], 409)
        self.assertEqual(self.call("POST", path + "/run")[0], 409)
        with open(self.service.jobs[job['id']]['path'], 'ab') as source:
            source.write(b'partial failed write')
        self.call("PUT", path + "/chunks/1", b"def", raw=True)
        self.assertEqual(self.service.jobs[job['id']]['path'].read_bytes(), b'abcdef')
        self.assertEqual(self.call("POST", path + "/run")[0], 202)
        for _ in range(100):
            result = self.call("GET", path)[1]
            if result["state"] == "complete":
                break
            time.sleep(.01)
        self.assertEqual(result["segments"][0]["end"], 1.5)
        self.assertFalse(self.service.jobs[job["id"]]["path"].exists())

    def test_limits_and_cancel(self):
        self.login()
        self.assertEqual(self.call("POST", "/jobs", {"mime": "audio/mp4", "bytes": module.MAX_BYTES + 1, "chunks": 1})[0], 400)
        _, job, _ = self.call("POST", "/jobs", {"mime": "audio/mp4", "bytes": 3, "chunks": 1})
        self.assertEqual(self.call("POST", "/jobs", {"mime": "audio/mp4", "bytes": 3, "chunks": 1})[0], 409)
        path = "/jobs/" + job["id"]
        self.assertEqual(self.call("PUT", path + "/chunks/0", b"a" * (module.MAX_PART + 1), raw=True)[0], 413)
        self.assertEqual(self.call("DELETE", path)[0], 200)
        self.assertEqual(self.call("GET", path)[1]["state"], "cancelled")

    def test_no_source_leak_on_model_error(self):
        def failed(_):
            raise RuntimeError("private machine path and credential")
        self.service.transcriber = failed
        self.login()
        _, job, _ = self.call("POST", "/jobs", {"mime": "audio/mp4", "bytes": 1, "chunks": 1})
        path = "/jobs/" + job["id"]
        self.call("PUT", path + "/chunks/0", b"a", raw=True)
        self.call("POST", path + "/run")
        for _ in range(100):
            result = self.call("GET", path)[1]
            if result["state"] == "failed":
                break
            time.sleep(.01)
        self.assertEqual(result["state"], "failed")
        self.assertNotIn("private", json.dumps(result))

    def test_secure_origin_and_login_limit(self):
        with self.assertRaises(ValueError):
            module.Service('test-only-passphrase-123', 'http://public.invalid')
        self.service.origin, self.service.secure = 'https://notes.invalid', True
        response = self.call('POST', '/login', {'password':'test-only-passphrase-123'}, origin='https://notes.invalid')
        self.assertIn('; Secure', response[2])
        for _ in range(9):
            self.call('POST', '/login', {'password':'wrong'}, origin='https://notes.invalid')
        self.assertEqual(self.call('POST', '/login', {'password':'wrong'}, origin='https://notes.invalid')[0], 429)

    def test_cleanup_rejects_paths_outside_private_job_root(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'audio.m4a';source.write_bytes(b'keep')
            with self.assertRaises(ValueError):
                self.service.remove_source({'path':source})
            self.assertEqual(source.read_bytes(), b'keep')


if __name__ == "__main__":
    unittest.main()
