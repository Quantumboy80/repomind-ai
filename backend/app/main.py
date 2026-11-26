import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import get_settings
from app.db.session import initialize_database
from app.api.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("repomind")
_rate_windows: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_rate_period_seconds = 60.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()], allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Authorization"])
app.include_router(router)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    started = time.perf_counter()
    if request.url.path.startswith("/api/"):
        client = request.client.host if request.client else "unknown"
        route_class = request.url.path
        if request.method == "POST" and route_class.endswith("/repositories"):
            limit = 5
        elif request.method == "POST" and route_class.endswith("/ask"):
            limit = 30
        elif request.method == "POST":
            limit = 30
        else:
            limit = 120
        bucket_class = "repository-registration" if request.method == "POST" and route_class.endswith("/repositories") else "posts" if request.method == "POST" else "reads"
        bucket = _rate_windows[(client, bucket_class)]
        now = time.monotonic()
        while bucket and now - bucket[0] >= _rate_period_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            logger.warning("Request rate limit reached for %s %s", request.method, route_class)
            return JSONResponse(status_code=429, headers={"Retry-After": "60"}, content={"error": {"code": "rate_limited", "message": "Too many requests. Please wait briefly and try again."}})
        bucket.append(now)
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Unhandled request error: %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "An unexpected server error occurred."}})
    logger.info("%s %s %s %.1fms", request.method, request.url.path, response.status_code, (time.perf_counter() - started) * 1000)
    return response


@app.get("/health")
def root_health():
    return {"status": "ok", "service": "repomind-api"}
