import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent / ".env")

from admin_routes import register_admin_routes
from payment_routes import register_payment_routes
from payment_report_routes import register_payment_report_routes
from lark_report_routes import register_lark_report_routes

app = FastAPI(title="pf-revenue API", version="0.1.0")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5174").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_supabase = None


def _get_supabase():
    global _supabase
    if _supabase is None:
        from supabase import create_client
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


register_admin_routes(app, _get_supabase)
register_payment_routes(app, _get_supabase)
register_payment_report_routes(app, _get_supabase)
register_lark_report_routes(app, _get_supabase)


@app.get("/health")
def health():
    return {"status": "ok"}
