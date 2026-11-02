# RekberSTORE Services

## Python FastAPI

Folder: services/python

Development server:

    .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010

API:
- GET /health
- POST /validate-listing
- POST /price-summary
- POST /security/check-text

Swagger:
http://127.0.0.1:8010/docs

## C++ Native Engine

Source:
- native/include/engine.h
- native/src/engine.cpp

Build with CMake:

    cmake -S native -B native/build
    cmake --build native/build --config Release

Python automatically loads the compiled library when found.

If no native compiler is available, FastAPI uses Python fallback.

## Next.js integration

Next.js API proxy:
- GET /api/engine/health
- POST /api/engine/validate-listing
- POST /api/engine/price-summary
- POST /api/engine/security/check-text

Default Python URL:
http://127.0.0.1:8010

Set ENGINE_SERVICE_URL on the server environment if needed.

Security note:
This engine provides input validation and simple text-pattern checks.
It is not a fraud detector, malware scanner, or legal compliance certification.
Keep the service bound to localhost during development.