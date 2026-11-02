import ctypes
import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "native" / "build"

app = FastAPI(
    title="RekberSTORE Engine API",
    version="1.0.0",
    description="Local processing service for RekberSTORE"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"]
)

CATEGORIES = {
    "Gaming",
    "Kreator",
    "Komunitas",
    "Bisnis digital",
    "Aset digital lainnya"
}

SENSITIVE_TERMS = [
    "password",
    "otp",
    "recovery code",
    "seed phrase",
    "private key"
]

def load_native():
    configured = os.getenv("REKBER_CPP_LIB")
    candidates = []

    if configured:
        candidates.append(Path(configured))

    candidates.extend([
        NATIVE / "rekber_engine.dll",
        NATIVE / "Release" / "rekber_engine.dll",
        NATIVE / "librekber_engine.so",
        NATIVE / "librekber_engine.dylib"
    ])

    for path in candidates:
        if path.exists():
            try:
                lib = ctypes.CDLL(str(path))

                lib.rs_validate_listing.argtypes = [
                    ctypes.c_char_p,
                    ctypes.c_char_p,
                    ctypes.c_char_p,
                    ctypes.c_longlong,
                    ctypes.c_int
                ]
                lib.rs_validate_listing.restype = ctypes.c_int

                lib.rs_sensitive_flags.argtypes = [ctypes.c_char_p]
                lib.rs_sensitive_flags.restype = ctypes.c_int

                lib.rs_price_stats.argtypes = [
                    ctypes.POINTER(ctypes.c_double),
                    ctypes.c_int,
                    ctypes.POINTER(ctypes.c_double),
                    ctypes.POINTER(ctypes.c_double),
                    ctypes.POINTER(ctypes.c_double)
                ]
                lib.rs_price_stats.restype = ctypes.c_int

                return lib
            except (OSError, AttributeError):
                continue

    return None


native = load_native()


class ListingInput(BaseModel):
    title: str = Field(min_length=5, max_length=100)
    category: Literal[
        "Gaming",
        "Kreator",
        "Komunitas",
        "Bisnis digital",
        "Aset digital lainnya"
    ]
    description: str = Field(min_length=20, max_length=3000)
    price: int = Field(ge=1000, le=10**12)
    ownership_confirmed: bool


class PriceInput(BaseModel):
    prices: list[float] = Field(min_length=1, max_length=100000)


class TextInput(BaseModel):
    text: str = Field(min_length=1, max_length=10000)


def python_sensitive_flags(text: str) -> list[str]:
    lowered = text.lower()
    return [term for term in SENSITIVE_TERMS if term in lowered]


@app.get("/health")
def health():
    return {
        "service": "RekberSTORE Engine",
        "status": "online",
        "python": True,
        "cpp_native": native is not None
    }


@app.post("/validate-listing")
def validate_listing(data: ListingInput):
    if not data.ownership_confirmed:
        raise HTTPException(
            status_code=422,
            detail="Konfirmasi hak kepemilikan diperlukan."
        )

    code = 0

    if native:
        code = native.rs_validate_listing(
            data.title.encode("utf-8"),
            data.category.encode("utf-8"),
            data.description.encode("utf-8"),
            data.price,
            int(data.ownership_confirmed)
        )
    else:
        if len(data.title.strip()) < 5:
            code = 1
        elif data.category not in CATEGORIES:
            code = 2
        elif len(data.description.strip()) < 20:
            code = 3
        elif data.price < 1000:
            code = 4

    errors = {
        1: "Judul listing tidak valid.",
        2: "Kategori tidak valid.",
        3: "Deskripsi terlalu pendek.",
        4: "Harga tidak valid.",
        5: "Konfirmasi kepemilikan diperlukan."
    }

    if code:
        raise HTTPException(status_code=422, detail=errors.get(code, "Listing tidak valid."))

    content = data.title + " " + data.description

    if native:
        flags = native.rs_sensitive_flags(content.encode("utf-8"))
        detected = [
            term for bit, term in enumerate(SENSITIVE_TERMS)
            if flags & (1 << bit)
        ]
    else:
        detected = python_sensitive_flags(content)

    return {
        "valid": True,
        "engine": "C++" if native else "Python fallback",
        "sensitive_terms_warning": detected,
        "message": "Validasi struktur listing berhasil."
    }


@app.post("/price-summary")
def price_summary(data: PriceInput):
    if any(price < 0 or price > 10**12 for price in data.prices):
        raise HTTPException(status_code=422, detail="Nilai harga tidak valid.")

    if native:
        values = (ctypes.c_double * len(data.prices))(*data.prices)
        minimum = ctypes.c_double()
        maximum = ctypes.c_double()
        average = ctypes.c_double()

        result = native.rs_price_stats(
            values,
            len(data.prices),
            ctypes.byref(minimum),
            ctypes.byref(maximum),
            ctypes.byref(average)
        )

        if result != 0:
            raise HTTPException(status_code=422, detail="Gagal menghitung statistik.")

        return {
            "engine": "C++",
            "count": len(data.prices),
            "minimum": minimum.value,
            "maximum": maximum.value,
            "average": average.value
        }

    return {
        "engine": "Python fallback",
        "count": len(data.prices),
        "minimum": min(data.prices),
        "maximum": max(data.prices),
        "average": sum(data.prices) / len(data.prices)
    }


@app.post("/security/check-text")
def check_text(data: TextInput):
    if native:
        flags = native.rs_sensitive_flags(data.text.encode("utf-8"))
        detected = [
            term for bit, term in enumerate(SENSITIVE_TERMS)
            if flags & (1 << bit)
        ]
        engine = "C++"
    else:
        detected = python_sensitive_flags(data.text)
        engine = "Python fallback"

    return {
        "engine": engine,
        "warning": bool(detected),
        "detected_terms": detected,
        "message": (
            "Periksa teks. Jangan membagikan kredensial atau kode rahasia."
            if detected else
            "Tidak ditemukan pola kata sensitif yang diperiksa."
        )
    }