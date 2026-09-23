from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import get_current_user
from app.api.routes import router, user_to_out
from app.core.config import get_settings
from app.db import SessionLocal
from app.models import User
from app.schemas import UserOut
from app.seed import run_seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = SessionLocal()
    try:
        run_seed(db)
    except Exception as exc:  # pragma: no cover - boot resilience
        print(f"[vbx-api] seed skipped: {exc}")
    finally:
        db.close()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="VBXSystem API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)

    @app.get("/auth/me", response_model=UserOut)
    def auth_me(user: User = Depends(get_current_user)) -> UserOut:
        return user_to_out(user)

    return app


app = create_app()
