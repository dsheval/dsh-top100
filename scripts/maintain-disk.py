#!/usr/bin/env python3
"""Host-only cache maintenance; preview by default. Never deletes runtime files."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys


def check_disk(container, run=subprocess.run):
    result = run(["docker", "exec", container, "node", "--import", "tsx",
                  "collector/src/disk-space-cli.ts"], capture_output=True, text=True, timeout=60)
    report = json.loads(result.stdout)
    expected = {"ready": 0, "insufficient": 2}
    if report.get("schemaVersion") != 1 or report.get("status") not in expected:
        raise RuntimeError("disk-check-failed")
    if result.returncode != expected[report["status"]]:
        raise RuntimeError("disk-check-failed")
    for key in ["availableBytes", "requiredBytes"]:
        if type(report.get(key)) is not int or report[key] < 0:
            raise RuntimeError("disk-check-failed")
    return report


def maintain(container, apply=False, run=subprocess.run, record=lambda value: None):
    before = check_disk(container, run)
    command = ["docker", "buildx", "prune", "--builder", "default",
               "--filter", "until=168h", "--force"]
    report = {"schemaVersion": 1, "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "mode": "apply" if apply else "preview", "before": before, "command": command,
              "action": "none", "after": before, "availableDeltaBytes": 0}
    if before["status"] == "ready":
        return report, 0
    if not apply:
        report["action"] = "would-prune-unused-build-cache-older-than-7-days"
        return report, 2
    # Persist intent before mutation. A failed log write must prevent cleanup.
    report["action"] = "prune-started"
    record(report)
    try:
        result = run(command, capture_output=True, text=True, timeout=300)
        report.update(action="prune-finished", exitCode=result.returncode, output=result.stdout)
    except subprocess.TimeoutExpired:
        report.update(action="prune-timeout", exitCode=124)
    record(report)
    report["after"] = check_disk(container, run)
    report["availableDeltaBytes"] = report["after"]["availableBytes"] - before["availableBytes"]
    # Insufficient space never expands the scope to images, volumes, backups or snapshots.
    if report["exitCode"] != 0:
        return report, 3
    return report, 0 if report["after"]["status"] == "ready" else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", default="dsh-top100-scheduler-1")
    parser.add_argument("--apply", action="store_true", help="Allow only unused build cache older than 7 days to be pruned")
    parser.add_argument("--log-dir", type=Path, help="Required for apply; persistent private host audit directory")
    args = parser.parse_args()
    if args.apply and not args.log_dir:
        parser.error("--apply requires --log-dir")
    log = lock = None
    try:
        if args.apply:
            args.log_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            lock = (args.log_dir / "maintenance.lock").open("a")
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S")
            fd = os.open(args.log_dir / f"{stamp}-{os.getpid()}.jsonl", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            log = os.fdopen(fd, "w")

        def record(value):
            if log:
                log.write(json.dumps(value) + "\n")
                log.flush()
                os.fsync(log.fileno())

        report, code = maintain(args.container, args.apply, record=record)
        record(report)
        print(json.dumps(report))
        return code
    except BlockingIOError:
        print(json.dumps({"status": "unknown", "code": "maintenance-already-running"}))
        return 3
    except Exception:
        # Never print Docker stderr, environment or private file paths.
        failure = {"status": "unknown", "code": "disk-maintenance-failed"}
        if log:
            try:
                log.write(json.dumps(failure) + "\n")
                log.flush()
            except OSError:
                pass
        print(json.dumps(failure))
        return 3
    finally:
        if log:
            log.close()
        if lock:
            lock.close()


if __name__ == "__main__":
    sys.exit(main())
