"""The submission-receipt mail: payload composition and the failure policy
around the Graph boundary. No network — the transport calls are stubbed."""

import datetime

import pytest

import app.services.mail as mail
from app.core.config import Settings
from tests.evaluation_fixtures import CYCLE, roster_employee


def settings(sender: str) -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        entra_tenant_id="tenant-id",
        entra_client_id="client-id",
        entra_client_secret="client-secret",
        mail_sender_address=sender,
    )


def test_token_request_body_carries_the_client_credentials_scope() -> None:
    body = mail._token_request_body(settings("noreply@emids.com"))

    assert body["grant_type"] == "client_credentials"
    assert body["scope"] == mail.GRAPH_SCOPE
    assert body["client_id"] == "client-id"
    assert body["client_secret"] == "client-secret"


def test_receipt_message_addresses_the_roster_email() -> None:
    payload = mail.receipt_message(roster_employee(), CYCLE, None)

    recipient = payload["message"]["toRecipients"][0]["emailAddress"]["address"]
    assert recipient == "asha_menon@emids.com"
    assert payload["saveToSentItems"] is True
    assert "2026" in payload["message"]["subject"]
    assert "submitted" in payload["message"]["subject"]


def test_receipt_bodies_name_the_employee_and_the_locking() -> None:
    moment = datetime.datetime(2027, 1, 10, 14, 5, tzinfo=datetime.timezone.utc)
    payload = mail.receipt_message(roster_employee(), CYCLE, moment)

    html = payload["message"]["body"]
    assert html["contentType"] == "HTML"
    body = html["content"]
    assert "Asha Menon" in body
    assert "10 January 2027" in body
    for phrase in ("submitted successfully", "manager review window closes", "2026"):
        assert phrase in body


async def test_blank_sender_is_disabled_before_any_network(monkeypatch) -> None:
    # The default dev/test configuration: the exchange must never even start —
    # calling _fetch_token_sync here is a test failure on its own terms.
    monkeypatch.setattr(
        mail,
        "_fetch_token_sync",
        lambda _settings: pytest.fail("a blank sender must not touch Graph"),
    )

    await mail.send_submission_receipt(roster_employee(), CYCLE, None, settings(""))


async def test_receipt_survives_a_graph_rejection(monkeypatch) -> None:
    # Log-and-continue: the send raising leaves the caller unharmed.
    async def fake_token(_settings: object) -> str:
        return "token-stub"

    monkeypatch.setattr(mail, "_acquire_token", fake_token)

    def boom(url: object, headers: object, payload: object) -> None:
        raise mail.MailDeliveryError("Graph rejected the sendMail call")

    monkeypatch.setattr(mail, "_send_sync", boom)

    await mail.send_submission_receipt(
        roster_employee(), CYCLE, None, settings("noreply@emids.com")
    )


async def test_receipt_uses_the_configured_sender_mailbox(monkeypatch) -> None:
    captured: dict = {}

    async def fake_token(_settings: object) -> str:
        return "token-stub"

    def fake_send(url: str, headers: dict[str, str], payload: dict) -> None:
        captured["url"] = url
        captured["payload"] = payload

    monkeypatch.setattr(mail, "_acquire_token", fake_token)
    monkeypatch.setattr(mail, "_send_sync", fake_send)

    await mail.send_submission_receipt(
        roster_employee(), CYCLE, None, settings("hr-receipts@emids.com")
    )

    assert captured["url"].startswith(mail.GRAPH_ROOT)
    # The mailbox is percent-encoded in the URL path — an `@` (%) is legal there.
    assert "/users/" in captured["url"]
    assert captured["url"].endswith("%40emids.com/sendMail")
    message = captured["payload"]["message"]
    to = message["toRecipients"][0]["emailAddress"]["address"]
    assert to == "asha_menon@emids.com"
