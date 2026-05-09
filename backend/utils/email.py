import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", 587))
SMTP_USER     = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FROM_NAME     = os.getenv("SMTP_FROM_NAME", "MyStorey")


def send_email(to: str, subject: str, html: str, text: str = ""):
    if not SMTP_USER or not SMTP_PASSWORD:
        print(f"[email] SMTP not configured — skipping email to {to}: {subject}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = formataddr((FROM_NAME, SMTP_USER))
    msg["To"]      = to

    if text:
        msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, to, msg.as_string())
    print(f"[email] Sent '{subject}' to {to}")
