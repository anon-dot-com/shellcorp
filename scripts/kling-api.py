#!/usr/bin/env python3
"""Kling AI API helper for video/image generation."""

import time
import json
import jwt
import requests
import sys
import os

# Load credentials
CREDS_PATH = os.path.expanduser("~/.config/kling/credentials.json")
with open(CREDS_PATH) as f:
    creds = json.load(f)

ACCESS_KEY = creds["access_key"]
SECRET_KEY = creds["secret_key"]
API_BASE = "https://api-singapore.klingai.com"


def get_token():
    """Generate JWT token for Kling API authentication."""
    headers = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": ACCESS_KEY,
        "exp": int(time.time()) + 1800,  # Valid for 30 min
        "nbf": int(time.time()) - 5       # Start 5s ago
    }
    return jwt.encode(payload, SECRET_KEY, headers=headers)


def api_request(method, endpoint, data=None):
    """Make authenticated API request."""
    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    url = f"{API_BASE}{endpoint}"
    
    if method == "GET":
        resp = requests.get(url, headers=headers, params=data)
    else:
        resp = requests.post(url, headers=headers, json=data)
    
    return resp.json()


def create_video(prompt, model="kling-v1-5", duration="5", aspect_ratio="16:9", mode="std"):
    """Create a text-to-video generation task."""
    data = {
        "model_name": model,
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "mode": mode  # std or pro
    }
    return api_request("POST", "/v1/videos/text2video", data)


def create_image_to_video(image_url, prompt, model="kling-v1-5", duration="5", mode="std"):
    """Create an image-to-video generation task."""
    data = {
        "model_name": model,
        "image": image_url,
        "prompt": prompt,
        "duration": duration,
        "mode": mode
    }
    return api_request("POST", "/v1/videos/image2video", data)


def get_task_status(task_id, task_type="text2video"):
    """Check status of a generation task."""
    return api_request("GET", f"/v1/videos/{task_type}/{task_id}")


def get_account_info():
    """Get account balance and info."""
    return api_request("GET", "/account/info")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: kling-api.py <command> [args]")
        print("Commands:")
        print("  account              - Get account info")
        print("  video <prompt>       - Create text-to-video")
        print("  status <task_id>     - Check task status")
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "account":
        result = get_account_info()
        print(json.dumps(result, indent=2))
    
    elif cmd == "video":
        if len(sys.argv) < 3:
            print("Usage: kling-api.py video <prompt>")
            sys.exit(1)
        prompt = sys.argv[2]
        result = create_video(prompt)
        print(json.dumps(result, indent=2))
    
    elif cmd == "status":
        if len(sys.argv) < 3:
            print("Usage: kling-api.py status <task_id>")
            sys.exit(1)
        task_id = sys.argv[2]
        result = get_task_status(task_id)
        print(json.dumps(result, indent=2))
    
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
