"""Outgoing email. Locally everything goes to Mailpit (http://localhost:8025)."""

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.config import get_settings


@dataclass
class OutgoingEmail:
    to: str
    subject: str
    text: str


class Mailer:
    def send(self, message: OutgoingEmail) -> None:
        settings = get_settings()
        msg = EmailMessage()
        msg["From"] = settings.mail_from
        msg["To"] = message.to
        msg["Subject"] = message.subject
        msg.set_content(message.text)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)


def get_mailer() -> Mailer:
    """FastAPI dependency, replaced by a fake in tests."""
    return Mailer()


_MAGIC_LINK_TEXT = {
    "en": (
        "Your Encore sign-in link",
        "Hi!\n\nClick this link to sign in to Encore:\n\n{link}\n\n"
        "The link works once and expires in {minutes} minutes.\n"
        "If you didn't ask for it, you can ignore this email.\n",
    ),
    "pt-BR": (
        "Seu link de acesso ao Encore",
        "Olá!\n\nClique neste link para entrar no Encore:\n\n{link}\n\n"
        "O link funciona uma vez e expira em {minutes} minutos.\n"
        "Se você não pediu este link, pode ignorar este e-mail.\n",
    ),
}


def magic_link_email(to: str, link: str, locale: str) -> OutgoingEmail:
    subject, body = _MAGIC_LINK_TEXT.get(locale, _MAGIC_LINK_TEXT["en"])
    minutes = get_settings().magic_link_minutes
    return OutgoingEmail(to=to, subject=subject, text=body.format(link=link, minutes=minutes))
