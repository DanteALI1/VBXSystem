from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import joinedload

from app.api import (
    auth_routes,
    cveql_routes,
    dashboard_routes,
    database_routes,
    epss_routes,
    groups_routes,
    profile_routes,
    routes,
    search_routes,
    users_routes,
    xdb_routes,
)
from app.core.config import get_settings
from app.db import SessionLocal
from app.models import User
from app.seed import run_seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = SessionLocal()
    try:
        run_seed(db)
    except Exception as exc:  # pragma: no cover
        print(f"[vbx-api] seed skipped: {exc}")
    finally:
        db.close()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="VBXSystem API", version="0.4.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(routes.router)
    app.include_router(auth_routes.router)
    app.include_router(profile_routes.router)
    app.include_router(users_routes.router)
    app.include_router(groups_routes.router)
    app.include_router(database_routes.router)
    app.include_router(search_routes.router)
    app.include_router(dashboard_routes.router)
    app.include_router(epss_routes.router)
    app.include_router(cveql_routes.router)
    app.include_router(xdb_routes.router)
    return app


app = create_app()


_ = (User, joinedload, SessionLocal)
