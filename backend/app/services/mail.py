"""The submission-receipt mail — the employees' side of Graph integration.

When an employee submits their self-evaluation, this service emails their
roster address (the same address the SSO identity resolves through) an
acknowledgment. It sends through Microsoft Graph's sendMail with the
application-permission flow: the Entra app's client credentials buy a Graph
access token, and the mail goes out as the no-reply mailbox configured in
settings.

Failure policy — log and continue: every failure path (HTTP error, timeout,
Graph 4xx/5xx) is logged with Microsoft's diagnostic body and swallows
itself. An acknowledgment is never worth failing the submission over.

Microsoft calls block, so each network step runs in a worker thread to keep
the event loop responsive — the same shape services/sso.py uses for its IdP
calls. The access token is cached until its expiry because submissions
cluster around the deadline.
"""

import asyncio
import datetime
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Final

from app.core.config import Settings
from app.models.employee import Employee
from app.models.review_cycle import ReviewCycle

logger = logging.getLogger(__name__)

GRAPH_ROOT: Final[str] = "https://graph.microsoft.com"
GRAPH_SCOPE: Final[str] = "https://graph.microsoft.com/.default"
_TOKEN_REUSE_MARGIN: Final[float] = 60.0

#: One process-wide holder: the tenant and client are constant per process,
#: so a second slot would never hold a different token.
class _TokenHolder:
    """Single-slot cache: None before first use, then {expires_at, token}."""

    expires_at: float = 0.0
    token: str = ""


_holder = _TokenHolder()


def _token_request_body(settings: Settings) -> dict[str, str]:
    return {
        "grant_type": "client_credentials",
        "client_id": settings.entra_client_id.strip(),
        "client_secret": settings.entra_client_secret.strip(),
        "scope": GRAPH_SCOPE,
    }


async def _acquire_token(settings: Settings) -> str:
    if _holder.token and _holder.expires_at > (
        datetime.datetime.now(datetime.timezone.utc).timestamp()
        + _TOKEN_REUSE_MARGIN
    ):
        return _holder.token
    token = await asyncio.to_thread(
        _fetch_token_sync, settings
    )
    return token


def _fetch_token_sync(settings: Settings) -> str:
    """Client-credentials exchange with the tenant's token endpoint."""
    body = urllib.parse.urlencode(_token_request_body(settings)).encode("utf-8")
    request = urllib.request.Request(
        f"https://login.microsoftonline.com/{settings.entra_tenant_id.strip()}"
        "/oauth2/v2.0/token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            document = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        diagnostic = exc.read().decode("utf-8", "replace")
        logger.error(
            "Graph token endpoint rejected the exchange: %s", diagnostic
        )
        raise MailDeliveryError(
            "the token endpoint rejected the client-credentials exchange"
        ) from None
    except Exception as exc:
        logger.exception("The Graph token request could not be delivered.")
        raise MailDeliveryError("the token request failed") from exc
    token = document.get("access_token")
    if not isinstance(token, str) or token.strip() == "":
        logger.error("The Graph token response carried no access_token.")
        raise MailDeliveryError("the token response carried no access_token")
    expires_in = document.get("expires_in")
    _holder.token = token
    _holder.expires_at = datetime.datetime.now(
        datetime.timezone.utc
    ).timestamp() + float(expires_in if isinstance(expires_in, (int, float)) else 3600)
    return token


class MailDeliveryError(Exception):
    """Internal: mail could not be sent. Never escapes the service."""


def _graph_sendmail_url(settings: Settings) -> str:
    mailbox = urllib.parse.quote(settings.mail_sender_address.strip())
    return f"{GRAPH_ROOT}/v1.0/users/{mailbox}/sendMail"


def _graph_sendmail_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _send_sync(
    url: str, headers: dict[str, str], payload: dict
) -> None:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        diagnostic = exc.read().decode("utf-8", "replace")
        logger.error("Graph rejected the sendMail call: %s", diagnostic)
        raise MailDeliveryError("Graph rejected the sendMail call") from None
    except Exception as exc:
        logger.exception("The Graph sendMail call could not be delivered.")
        raise MailDeliveryError("the sendMail call failed") from exc


def _format_slot(slot: datetime.datetime | None) -> str:
    if slot is None:
        slot = datetime.datetime.now(datetime.timezone.utc)
    if slot.tzinfo is None:
        slot = slot.replace(tzinfo=datetime.timezone.utc)
    return slot.strftime("%d %B %Y at %H:%M UTC")


def _receipt_text(
    employee: Employee, cycle: ReviewCycle, submitted_at: datetime.datetime | None
) -> str:
    return (
        f"Hello {employee.employee_name},\n"
        "\n"
        "Thank you for completing your self-evaluation. This confirms that "
        f"your self-evaluation form for the {cycle.review_year} Annual "
        f"Performance Review was submitted successfully on {_format_slot(submitted_at)}.\n"
        "\n"
        "What happens next:\n"
        "- Your self-evaluation is now locked and has moved to your "
        "reporting manager's evaluation phase.\n"
        "- Your forward commitments stay editable until the manager review "
        f"window closes on {cycle.manager_review_end.strftime('%d %B %Y')}.\n"
        "\n"
        "You can review your submission any time in the Performance Review "
        "Portal. If you need a correction after this point, contact your "
        "HR team.\n"
        "\n"
        "Warm regards,\n"
        "Emids People & Performance Team\n"
    )


def _receipt_html(
    employee: Employee, cycle: ReviewCycle, submitted_at: datetime.datetime | None
) -> str:
    return (
        '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;'
        'color:#25313f;line-height:1.6;max-width:640px;">'
        f"<p>Hello {employee.employee_name},</p>"
        "<p>Thank you for completing your self-evaluation. This confirms that "
        f"your self-evaluation form for the {cycle.review_year} Annual "
        "Performance Review was <strong>submitted successfully</strong> on "
        f"{_format_slot(submitted_at)}.</p>"
        "<p><strong>What happens next</strong></p>"
        "<ul>"
        "<li>Your self-evaluation is now locked and has moved to your "
        "reporting manager's evaluation phase.</li>"
        "<li>Your forward commitments stay editable until the manager review "
        f"window closes on {cycle.manager_review_end.strftime('%d %B %Y')}.</li>"
        "</ul>"
        "<p>You can review your submission any time in the Performance Review "
        "Portal. If you need a correction after this point, contact your "
        "HR team.</p>"
        "<p style=\"margin-top:32px;\">Warm regards,<br>Emids People &amp; "
        "Performance Team</p>"
        "</div>"
    )


def receipt_message(
    employee: Employee,
    cycle: ReviewCycle,
    submitted_at: datetime.datetime | None = None,
) -> dict:
    """The exact Graph sendMail payload this service sends — pure, so the
    composition is testable without any network."""
    subject = (
        f"Your {cycle.review_year} Performance Review self-evaluation "
        "has been submitted"
    )
    return {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": _receipt_html(employee, cycle, submitted_at),
            },
            "toRecipients": [
                {"emailAddress": {"address": employee.email.strip()}}
            ],
        },
        "saveToSentItems": True,
    }


async def send_submission_receipt(
    employee: Employee,
    cycle: ReviewCycle,
    submitted_at: datetime.datetime | None,
    settings: Settings,
) -> None:
    """Email the submission acknowledgment. Disabled (no sender mailbox) or
    failed (any transport error) = a silent no-op the submit flow never
    notices beyond the time it takes."""
    if settings.mail_sender_address.strip() == "":
        return
    try:
        token = await _acquire_token(settings)
        payload = receipt_message(employee, cycle, submitted_at)
        await asyncio.to_thread(
            _send_sync,
            _graph_sendmail_url(settings),
            _graph_sendmail_headers(token),
            payload,
        )
        logger.info(
            "Submission receipt mailed to %s for %s.",
            employee.email,
            employee.employee_id,
        )
    except Exception:
        # The inner handlers already logged the transport details; this catch
        # exists so nothing the mail layer can raise reaches the submit.
        logger.warning("Submission-receipt mail did not go out.")