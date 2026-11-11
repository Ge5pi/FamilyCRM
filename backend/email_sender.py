"""Transactional email delivery.

Only password reset emails are sent at the moment. When SMTP is not
configured the message is logged instead, which keeps local development
self-contained.
"""

import logging
import smtplib
from email.message import EmailMessage

from config import settings

logger = logging.getLogger("familycrm.email")


def smtp_configured() -> bool:
    return settings.smtp_configured


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email, or log it when SMTP is not configured."""
    if not settings.smtp_configured:
        logger.warning(
            "SMTP is not configured. Email to %s was not sent.\nSubject: %s\n%s",
            to,
            subject,
            body,
        )
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


def send_password_reset_code(
    to: str, name: str, code: str, valid_minutes: int
) -> None:
    subject = "FamilyCRM: восстановление пароля"
    body = (
        f"Здравствуйте, {name}!\n\n"
        f"Код для сброса пароля: {code}\n"
        f"Код действует {valid_minutes} минут.\n\n"
        "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.\n"
    )
    send_email(to, subject, body)
