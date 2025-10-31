"""
Zero@Design API — v0.3.7 (stable)
- UUID veya 'code' ile ürün arar
- JSON-safe hata yakalama (UPSTREAM, STORAGE, INTERNAL)
- ReportLab PDF’te başlık + gri çizgi + detay
- Storage (SUPABASE_SERVICE_ROLE) varsa signed URL döner
"""

import os, io, re, time
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# === Load .env ===
load_dotenv()

APP_NAME = "Zero@Design FAZ 1.2 API"
VERSION = "0.3.7"

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE", "")
PDF_BUCKET = os.getenv("PDF_BUCKET", "reports")
PDF_SIGNED_URL_EXPIRES = int(os.getenv("PDF_SIGNED_URL_EXPIRES", "3600"))
DEBUG = os.getenv("APP_DEBUG", "0") in ("1", "true", "True")

app = FastAPI(title=APP_NAME, version=VERSION)

# CORS middleware ekle
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Geliştirme için tüm origin'lere izin ver
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global DPP storage (gerçek uygulamada veritabanı olacak)
dpp_storage = [
    {
        "dpp_id": "dpp-001",
        "product_name": "Organik Pamuk T-Shirt",
        "category": "Tekstil",
        "co2_footprint": 2.5,
        "sustainability_score": 85,
        "created_at": "2024-01-15T10:30:00Z"
    },
    {
        "dpp_id": "dpp-002", 
        "product_name": "Geri Dönüştürülmüş Polyester Ceket",
        "category": "Giyim",
        "co2_footprint": 4.2,
        "sustainability_score": 78,
        "created_at": "2024-01-20T14:15:00Z"
    },
    {
        "dpp_id": "dpp-003",
        "product_name": "Bambu Fiber Çorap",
        "category": "Aksesuar", 
        "co2_footprint": 1.1,
        "sustainability_score": 92,
        "created_at": "2024-01-25T09:45:00Z"
    }
]

UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


# === Helpers ===
def _supabase_headers(jwt: str):
    return {"apikey": jwt, "Authorization": f"Bearer {jwt}"}


class ReportIn(BaseModel):
    product_id: str


@app.get("/health")
def health():
    return {
        "app": APP_NAME,
        "version": VERSION,
        "supabase_url_set": bool(SUPABASE_URL),
        "service_key_set": bool(SUPABASE_SERVICE_ROLE),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


async def _get_json(client: httpx.AsyncClient, url: str, headers: dict, params: dict):
    """Supabase GET -> (ok, data or error_dict)"""
    r = await client.get(url, headers=headers, params=params)
    if r.status_code == 200:
        try:
            return True, r.json()
        except Exception as e:
            return False, {"code": "BAD_JSON", "detail": str(e), "raw": r.text[:200]}
    try:
        err = r.json()
    except Exception:
        err = {"text": r.text[:200]}
    return False, {"status": r.status_code, "error": err}


async def fetch_product_and_weight(product_id: str):
    """UUID veya code ile ürün + weight döner."""
    is_uuid = bool(UUID_RE.match(product_id))
    field = "id" if is_uuid else "code"
    value = product_id

    async with httpx.AsyncClient(timeout=30) as client:
        # Products
        ok, res = await _get_json(
            client,
            f"{SUPABASE_URL}/rest/v1/products",
            _supabase_headers(SUPABASE_ANON_KEY),
            {field: f"eq.{value}", "select": "*", "limit": 1},
        )
        if not ok:
            return None, None, {"code": "UPSTREAM_ERROR_PRODUCTS", "detail": res}
        if not res:
            return None, None, {"code": "PRODUCT_NOT_FOUND", "detail": f"{field}={value}"}

        prod = res[0]
        prod_uuid = prod.get("id")
        if not prod_uuid:
            return None, None, {"code": "BAD_PRODUCT_ROW", "detail": "UUID id yok"}

        # Weights
        ok, res = await _get_json(
            client,
            f"{SUPABASE_URL}/rest/v1/product_weights",
            _supabase_headers(SUPABASE_ANON_KEY),
            {"product_id": f"eq.{prod_uuid}", "select": "weight_kg", "limit": 1},
        )
        if not ok:
            return prod, None, {"code": "UPSTREAM_ERROR_WEIGHTS", "detail": res}
        if not res or res[0].get("weight_kg") in (None, 0):
            return prod, None, {"code": "MISSING_WEIGHT", "detail": f"product_id={prod_uuid}"}

        return prod, res[0], None


def render_pdf_bytes(product: dict, weight: dict) -> bytes:
    """Basit markalı PDF üretimi."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Product Report — {product.get('code') or product.get('id')}")

    # Header
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 820, "Zero@Design — Product Report")
    c.setStrokeColor(colors.grey)
    c.setLineWidth(0.5)
    c.line(72, 810, 72 + 120 * mm, 810)

    # Body
    c.setFont("Helvetica", 12)
    y = 780
    c.drawString(72, y, f"Product Code : {product.get('code','-')}"); y -= 20
    c.drawString(72, y, f"Name         : {product.get('name','-')}"); y -= 20
    c.drawString(72, y, f"Weight (kg)  : {weight.get('weight_kg','-')}"); y -= 40
    c.drawString(72, y, f"Generated At : {time.strftime('%Y-%m-%d %H:%M:%S')}")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()


async def upload_pdf_and_sign(path: str, data: bytes) -> str:
    if not SUPABASE_SERVICE_ROLE:
        return ""
    async with httpx.AsyncClient(timeout=60) as client:
        up = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/{PDF_BUCKET}/{path}",
            headers=_supabase_headers(SUPABASE_SERVICE_ROLE),
            content=data,
        )
        if up.status_code not in (200, 201):
            raise RuntimeError(f"UPLOAD_FAIL {up.status_code}: {up.text[:120]}")
        sign = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/sign/{PDF_BUCKET}/{path}",
            headers=_supabase_headers(SUPABASE_SERVICE_ROLE),
            json={"expiresIn": PDF_SIGNED_URL_EXPIRES},
        )
        if sign.status_code != 200:
            raise RuntimeError(f"SIGN_FAIL {sign.status_code}: {sign.text[:120]}")
        return sign.json().get("signedURL", "")


@app.post("/ai/product-report")
async def product_report(inp: ReportIn):
    try:
        product, weight, err = await fetch_product_and_weight(inp.product_id)
        if err:
            code = err.get("code")
            detail = err.get("detail")
            status = 400
            if code == "PRODUCT_NOT_FOUND":
                status = 404
            elif code == "MISSING_WEIGHT":
                status = 422
            elif code.startswith("UPSTREAM_ERROR"):
                status = 502
            return JSONResponse(status_code=status, content={"ok": False, "code": code, "detail": detail})

        pdf = render_pdf_bytes(product, weight)
        ts = int(time.time())
        key = f"{product.get('code') or inp.product_id}/{ts}.pdf"

        if SUPABASE_SERVICE_ROLE:
            try:
                url = await upload_pdf_and_sign(key, pdf)
                if url:
                    return {"ok": True, "product_code": product.get("code"), "pdf_url": url}
            except Exception as e:
                msg = str(e)
                if DEBUG:
                    return JSONResponse(status_code=502, content={"ok": False, "code": "STORAGE_ERROR", "detail": msg})
                return JSONResponse(status_code=502, content={"ok": False, "code": "STORAGE_ERROR"})

        return {"ok": True, "product_code": product.get("code"), "pdf_len": len(pdf)}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": "INTERNAL_ERROR", "detail": str(e) if DEBUG else "internal error"},
        )


# DPP API Endpoints
@app.get("/api/dpp-list")
async def get_dpp_list():
    """DPP listesini döndürür"""
    try:
        return {
            "success": True,
            "dpps": dpp_storage,
            "count": len(dpp_storage)
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e) if DEBUG else "DPP listesi yüklenirken hata oluştu"
            }
        )


@app.get("/api/dpp/{dpp_id}")
async def get_dpp_details(dpp_id: str):
    """Belirli bir DPP'nin detaylarını döndürür"""
    try:
        # Global dpp_storage listesinden DPP'yi bul
        dpp_basic = None
        for dpp in dpp_storage:
            if dpp["dpp_id"] == dpp_id:
                dpp_basic = dpp
                break
        
        if not dpp_basic:
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "error": "DPP bulunamadı"
                }
            )
        
        # Frontend'in beklediği veri yapısına uygun detaylı DPP verisi oluştur
        detailed_dpp = {
            "dpp_id": dpp_basic["dpp_id"],
            "product_info": {
                "name": dpp_basic["product_name"],
                "category": dpp_basic["category"],
                "brand": "Zero@Design",
                "season": "2024 İlkbahar",
                "collection": "Sürdürülebilir Koleksiyon"
            },
            "sustainability": {
                "co2_footprint": {
                    "total_kg": dpp_basic["co2_footprint"],
                    "calculation_method": "LCA (Yaşam Döngüsü Analizi)"
                },
                "sustainability_score": dpp_basic["sustainability_score"]
            },
            "materials": {
                "total_weight": "250",
                "fiber_composition": [
                    {"fiber": "Organik Pamuk", "percentage": 95},
                    {"fiber": "Elastan", "percentage": 5}
                ]
            },
            "production": {
                "manufacturing_location": "Türkiye",
                "production_date": dpp_basic["created_at"][:10],
                "batch_number": f"BATCH-{dpp_basic['dpp_id'][-6:]}",
                "processes": ["Eğirme", "Dokuma", "Boyama", "Konfeksiyon"]
            },
            "created_at": dpp_basic["created_at"]
        }
        
        return {
            "success": True,
            "dpp": detailed_dpp
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                 "success": False,
                 "error": str(e) if DEBUG else "DPP detayları yüklenirken hata oluştu"
             }
         )


@app.post("/api/create-dpp")
async def create_dpp(dpp_data: dict):
    """Yeni DPP oluşturur"""
    try:
        import uuid
        from datetime import datetime
        
        new_dpp_id = f"dpp-{str(uuid.uuid4())[:8]}"
        
        # Yeni DPP'yi storage'a ekle
        new_dpp = {
            "dpp_id": new_dpp_id,
            "product_name": dpp_data.get("product_name", "Bilinmeyen Ürün"),
            "category": dpp_data.get("product_type", "Genel"),
            "co2_footprint": dpp_data.get("total_co2", 0),
            "sustainability_score": dpp_data.get("sustainability_score", 0),
            "created_at": datetime.now().isoformat() + "Z"
        }
        
        dpp_storage.append(new_dpp)
        
        return {
            "success": True,
            "dpp_id": new_dpp_id,
            "message": "DPP başarıyla oluşturuldu"
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e) if DEBUG else "DPP oluşturulurken hata oluştu"
            }
        )

@app.get("/api/nft-metadata/{dpp_id}")
async def get_nft_metadata(dpp_id: str):
    """DPP için NFT metadata döndürür"""
    try:
        # Örnek NFT metadata - gerçek uygulamada DPP verilerinden oluşturulacak
        nft_metadata = {
            "name": f"Zero@Design DPP #{dpp_id}",
            "description": "Sürdürülebilir moda için dijital ürün pasaportu NFT'si",
            "image": f"https://api.zero-at-design.com/nft-images/{dpp_id}.png",
            "external_url": f"https://zero-at-design.com/dpp/{dpp_id}",
            "attributes": [
                {
                    "trait_type": "Sürdürülebilirlik Skoru",
                    "value": 85
                },
                {
                    "trait_type": "CO₂ Ayak İzi",
                    "value": "8.5 kg"
                },
                {
                    "trait_type": "Kategori",
                    "value": "Tekstil"
                },
                {
                    "trait_type": "Sertifikalar",
                    "value": "GOTS, OEKO-TEX"
                },
                {
                    "trait_type": "Üretim Yeri",
                    "value": "Türkiye"
                }
            ],
            "properties": {
                "dpp_id": dpp_id,
                "blockchain": "Ethereum",
                "standard": "ERC-721",
                "created_at": "2024-01-15T10:30:00Z"
            }
        }
        
        return nft_metadata
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e) if DEBUG else "NFT metadata yüklenirken hata oluştu"
            }
        )