"""SMTP send helper (MailHog in compose for dev)."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage


def send_smtp_message(
    *,
    host: str,
    port: int,
    username: str = "",
    password: str = "",
    use_tls: bool = False,
    from_addr: str,
    to_addr: str,
    subject: str,
    body: str,
    timeout: float = 10.0,
) -> dict:
    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(body)

    if use_tls:
        with smtplib.SMTP(host, port, timeout=timeout) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            if username:
                smtp.login(username, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=timeout) as smtp:
            smtp.ehlo()
            if username:
                smtp.login(username, password)
            smtp.send_message(msg)
    return {"ok": True, "to": to_addr, "host": host, "port": port}
