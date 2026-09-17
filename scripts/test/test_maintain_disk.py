import importlib.util
from pathlib import Path
from subprocess import CompletedProcess, TimeoutExpired
import json
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location("maintain_disk", Path(__file__).parents[1] / "maintain-disk.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def check(status="insufficient", available=100):
    return CompletedProcess([], 0 if status == "ready" else 2, json.dumps({
        "schemaVersion": 1, "status": status, "availableBytes": available, "requiredBytes": 500}), "")


class MaintenanceSafety(unittest.TestCase):
    def test_preview_does_not_delete(self):
        run = Mock(return_value=check())
        report, code = module.maintain("scheduler", run=run)
        self.assertEqual(code, 2)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][:2], ["docker", "exec"])
        self.assertEqual(report["after"], report["before"])

    def test_no_prune_when_capacity_is_ready(self):
        run = Mock(return_value=check("ready", 1000))
        _, code = module.maintain("scheduler", True, run)
        self.assertEqual(code, 0)
        self.assertEqual(run.call_count, 1)

    def test_full_cache_cleanup_still_insufficient_never_escalates(self):
        run = Mock(side_effect=[check(), CompletedProcess([], 0, "Total: 0B", ""), check()])
        record = Mock()
        report, code = module.maintain("scheduler", True, run, record)
        self.assertEqual(code, 2)
        self.assertEqual(report["availableDeltaBytes"], 0)
        self.assertEqual(run.call_count, 3)
        self.assertEqual(run.call_args_list[1].args[0], ["docker", "buildx", "prune", "--builder", "default", "--filter", "until=168h", "--force"])
        self.assertEqual(record.call_count, 2)

    def test_bad_disk_report_never_deletes(self):
        for output in ["not json", '{"schemaVersion":1,"status":"unknown"}']:
            run = Mock(return_value=CompletedProcess([], 3, output, "secret error"))
            with self.assertRaises(Exception):
                module.maintain("scheduler", True, run)
            self.assertEqual(run.call_count, 1)

    def test_log_failure_prevents_prune(self):
        run = Mock(return_value=check())
        with self.assertRaises(OSError):
            module.maintain("scheduler", True, run, Mock(side_effect=OSError("disk full")))
        self.assertEqual(run.call_count, 1)

    def test_failed_or_timed_out_prune_is_not_success(self):
        for prune in [CompletedProcess([], 1, "", "private error"), TimeoutExpired("docker", 300)]:
            run = Mock(side_effect=[check(), prune, check("ready", 1000)])
            _, code = module.maintain("scheduler", True, run)
            self.assertEqual(code, 3)

    def test_success_requires_fresh_capacity_measurement(self):
        run = Mock(side_effect=[check(), CompletedProcess([], 0, "done", ""), check("ready", 1000)])
        report, code = module.maintain("scheduler", True, run)
        self.assertEqual(code, 0)
        self.assertEqual(report["availableDeltaBytes"], 900)


if __name__ == "__main__":
    unittest.main()
