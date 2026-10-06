"""Outgoing email over SMTP (Brevo, Gmail app password, Mailgun, ...). Off until SMTP_HOST / SMTP_USER / SMTP_PASS are set."""
import smtplib
import ssl
from email.message import EmailMessage

import config


def configured() -> bool:
    return bool(config.SMTP_HOST and config.SMTP_USER and config.SMTP_PASS and config.MAIL_FROM)


def send(to: str, subject: str, text: str) -> bool:
    if not configured():
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = f"ARCANA AI <{config.MAIL_FROM}>", to, subject
    msg.set_content(text)
    try:
        if config.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(config.SMTP_HOST, 465, timeout=20, context=ssl.create_default_context()) as s:
                s.login(config.SMTP_USER, config.SMTP_PASS)
                s.send_message(msg)
        else:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(config.SMTP_USER, config.SMTP_PASS)
                s.send_message(msg)
        return True
    except Exception:
        return False
