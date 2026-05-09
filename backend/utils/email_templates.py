def booking_confirmed(booking: dict, user_name: str) -> tuple[str, str]:
    subject = f"Booking confirmed — {booking['host_name']} storage"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
      <div style="background:#0ea5e9;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:22px">Your storage is booked ✅</h1>
      </div>
      <div style="padding:24px;background:#f8fafc;border-radius:0 0 12px 12px">
        <p>Hi {user_name},</p>
        <p>Your booking with <strong>{booking['host_name']}</strong> is confirmed.</p>
        <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0">
          <p style="margin:4px 0"><strong>📍 Address:</strong> {booking['address']}</p>
          <p style="margin:4px 0"><strong>📅 From:</strong> {booking['start_date']}</p>
          <p style="margin:4px 0"><strong>📅 Until:</strong> {booking['end_date']}</p>
          <p style="margin:4px 0"><strong>💳 Total:</strong> S${booking['total_sgd']:.2f} (held securely)</p>
        </div>
        <p style="font-size:13px;color:#64748b">
          Payment is released to your host only after your items are confirmed collected.
        </p>
      </div>
    </div>
    """
    text = f"Booking confirmed with {booking['host_name']}. {booking['address']}. {booking['start_date']} to {booking['end_date']}."
    return subject, html


def climate_alert(user_name: str, district: str, temp: float, items: list) -> tuple[str, str]:
    items_html = "".join(f"<li>{i}</li>" for i in items)
    subject    = f"⚠️ Temperature alert — your storage unit in {district}"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
      <div style="background:#f59e0b;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:22px">🌡️ Temperature alert</h1>
      </div>
      <div style="padding:24px;background:#fffbeb;border-radius:0 0 12px 12px">
        <p>Hi {user_name},</p>
        <p>Temperature near your unit in <strong>{district}</strong> has reached
           <strong>{temp:.1f}°C</strong> (live NEA data).</p>
        <p>These items may be at risk:</p>
        <ul style="color:#92400e">{items_html}</ul>
        <a href="https://MyStorey.app/retrieve"
           style="display:inline-block;background:#f59e0b;color:white;padding:12px 24px;
                  border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px">
          Arrange early retrieval →
        </a>
      </div>
    </div>
    """
    text = f"Temperature alert: {temp:.1f}°C near your {district} unit. Items: {', '.join(items)}."
    return subject, html


def lease_expiry_reminder(user_name: str, booking: dict, days_left: int) -> tuple[str, str]:
    subject = f"Your storage lease expires in {days_left} days"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1e293b;padding:24px">
      <h2>Heads up, {user_name} 👋</h2>
      <p>Your storage at <strong>{booking['address']}</strong> expires on
         <strong>{booking['end_date']}</strong> ({days_left} days away).</p>
      <a href="https://MyStorey.app/bookings/{booking['id']}"
         style="display:inline-block;background:#0ea5e9;color:white;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600">
        Manage booking →
      </a>
    </div>
    """
    text = f"Storage at {booking['address']} expires in {days_left} days ({booking['end_date']})."
    return subject, html
