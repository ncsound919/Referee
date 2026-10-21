"""Modal deployment for the Referee deterministic audit service.

Deploy with:
    modal deploy modal_app.py

This exposes the FastAPI app (referee_core.api:app) as a Modal web endpoint
so Concordance can reach Referee without managing EC2. Set REFEREE_URL to the
printed URL and REFEREE_API_KEY to the shared secret.
"""
import modal

app = modal.App("referee-core")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("fastapi", "uvicorn", "pydantic", "numpy", "scipy", "scikit-learn", "cryptography", "pandas")
    .add_local_dir("referee_core", remote_path="/root/referee_core")
    .add_local_file("pyproject.toml", remote_path="/root/pyproject.toml")
)


@app.function(image=image, secrets=[modal.Secret.from_name("referee-api-key")])
@modal.asgi_app()
def fastapi_app():
    import os
    import sys

    sys.path.insert(0, "/root")
    os.environ.setdefault("REFEREE_MAX_CSV_MB", "25")
    from referee_core.api import app as referee_app

    return referee_app