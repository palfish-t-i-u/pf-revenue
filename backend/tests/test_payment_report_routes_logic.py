from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import payment_report_routes as report_routes


class FakeResult:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return self


class FakeTable:
    def __init__(self, name: str, rows: list[dict]):
        self.name = name
        self.rows = [dict(row) for row in rows]
        self.current = [dict(row) for row in rows]

    def select(self, *_args, **_kwargs):
        return self

    def is_(self, field, value):
        if value == "null":
            self.current = [row for row in self.current if row.get(field) is None]
        else:
            self.current = [row for row in self.current if row.get(field) is value]
        return self

    def eq(self, field, value):
        self.current = [row for row in self.current if row.get(field) == value]
        return self

    def gte(self, field, value):
        self.current = [row for row in self.current if (row.get(field) or "") >= value]
        return self

    def lte(self, field, value):
        self.current = [row for row in self.current if (row.get(field) or "") <= value]
        return self

    def in_(self, field, values):
        values = set(values)
        self.current = [row for row in self.current if row.get(field) in values]
        return self

    def execute(self):
        return FakeResult(self.current)


class FakeSupabase:
    def __init__(self):
        self.tables = {
            "payments": [
                {
                    "pay_time": "2026-06-09T08:00:00",
                    "sale_id": "sale-1",
                    "channel_id": "channel-1",
                    "real_pay_vnd": 3_700_000,
                    "gmv_rmb": 1000,
                    "gmv_final": 1000,
                    "status": "active",
                    "deleted_at": None,
                },
                {
                    "pay_time": "2026-06-09T09:00:00",
                    "sale_id": "sale-1",
                    "channel_id": "channel-1",
                    "real_pay_vnd": 7_400_000,
                    "gmv_rmb": 2000,
                    "gmv_final": 2000,
                    "status": "refunded",
                    "deleted_at": None,
                },
            ],
            "sales": [
                {"id": "sale-1", "full_name": "Sale A", "team": "In-house", "khoi": "Garden"}
            ],
            "channels": [
                {"id": "channel-1", "name": "Ads"}
            ],
        }

    def table(self, name: str):
        return FakeTable(name, self.tables[name])


def make_client() -> TestClient:
    app = FastAPI()
    report_routes.resolve_actor = lambda sb, authorization: {"role": "system"}
    report_routes.require_min_role = lambda actor, role: None
    report_routes.register_payment_report_routes(app, lambda: FakeSupabase())
    return TestClient(app)


def test_bctb_excludes_refunded_and_adds_full_name_alias() -> None:
    client = make_client()

    response = client.get("/api/v1/reports/bctb", params={"from": "2026-06-09", "to": "2026-06-09"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["date_keys"] == ["2026-06-09"]
    assert payload["data"][0]["total"]["count"] == 1
    assert payload["data"][0]["total"]["gmv_final"] == 1000
    assert payload["data"][0]["crm_name"] == "Sale A"
    assert payload["data"][0]["full_name"] == "Sale A"


def test_team_and_channel_reports_exclude_refunded() -> None:
    client = make_client()

    team_response = client.get("/api/v1/reports/team", params={"from": "2026-06-09", "to": "2026-06-09"})
    channel_response = client.get("/api/v1/reports/channel", params={"from": "2026-06-09", "to": "2026-06-09"})

    assert team_response.status_code == 200
    assert channel_response.status_code == 200
    assert team_response.json()["rows"][0]["count"] == 1
    assert team_response.json()["rows"][0]["gmv_final"] == 1000
    assert channel_response.json()["rows"][0]["count"] == 1
    assert channel_response.json()["rows"][0]["gmv_final"] == 1000
