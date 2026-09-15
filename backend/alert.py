import os
import requests
from dotenv import load_dotenv

load_dotenv()

NTFY_SERVER = os.getenv("NTFY_SERVER", "https://ntfy.sh")
NTFY_TOPIC = os.getenv("NTFY_TOPIC")


def send_alert(sound, confidence):
    if not NTFY_TOPIC:
        print("❌ NTFY_TOPIC is missing")
        return False

    url = f"{NTFY_SERVER}/{NTFY_TOPIC}"

    message = (
        "⚠️ Dangerous sound detected!\n\n"
        f"Sound: {sound}\n"
        f"Confidence: {confidence:.1%}"
    )

    headers = {
        "Title": "Environmental Sound Alert",
        "Priority": "urgent",
        "Tags": "warning",
    }

    print(f"📢 Sending ntfy alert to: {url}")

    try:
        response = requests.post(
            url,
            data=message.encode("utf-8"),
            headers=headers,
            timeout=5,
        )

        print("ntfy status:", response.status_code)
        print("ntfy response:", response.text)

        response.raise_for_status()

        print("✅ ntfy alert sent successfully")
        return True

    except requests.RequestException as e:
        print("❌ ntfy alert failed:", e)
        return False