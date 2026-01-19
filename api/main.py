import os
import json
import gspread
import pytz
import requests
import hashlib
import time as time_module
from datetime import datetime, timedelta, time
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Optional, List
from dotenv import load_dotenv
import pusher
from pymongo import MongoClient
from bson import ObjectId
import re

load_dotenv()

app = FastAPI()

# --- SECURITY: LOAD SECRETS ---
PUSHER_APP_ID = os.getenv("PUSHER_APP_ID")
PUSHER_KEY = os.getenv("PUSHER_KEY")
PUSHER_SECRET = os.getenv("PUSHER_SECRET")
PUSHER_CLUSTER = os.getenv("PUSHER_CLUSTER")
MONGO_URI = os.getenv("MONGO_URI")

pusher_client = pusher.Pusher(
  app_id=PUSHER_APP_ID,
  key=PUSHER_KEY,
  secret=PUSHER_SECRET,
  cluster=PUSHER_CLUSTER,
  ssl=True
)

# --- MONGODB SETUP ---
try:
    mongo_client = MongoClient(MONGO_URI)
    db = mongo_client["twh_portal"]
    
    billing_col = db["billing"]
    insurance_col = db["insurance"]
    design_col = db["design"]
    ebook_col = db["ebook"]
    
    print("Connected to MongoDB successfully.")
except Exception as e:
    print(f"MongoDB Connection Error: {e}")

# --- CHAT SETUP ---
CHAT_HISTORY = []
CHAT_RATE_LIMIT = {"start": 0, "count": 0}

# --- SETUP DIRECTORIES ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if not os.path.exists(os.path.join(BASE_DIR, "templates")):
    BASE_DIR = os.getcwd()

TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

templates = Jinja2Templates(directory=TEMPLATES_DIR)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
TZ_KARACHI = pytz.timezone("Asia/Karachi")

# --- SHEETS SETUP ---
gc = None
SHEET_MAIN = "Company_Transactions"
SHEET_NEW = "E-Books and Design from Portal"

def get_gc():
    global gc
    try:
        service_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE")
        service_json = os.getenv("GCP_SERVICE_ACCOUNT") 
        if service_file and os.path.exists(service_file):
            gc = gspread.service_account(filename=service_file)
        elif service_json:
            gc = gspread.service_account_from_dict(json.loads(service_json))
    except Exception as e:
        print(f"Error loading credentials: {e}")
        gc = None
    return gc

def get_worksheet(sheet_type):
    global gc
    if not gc: get_gc()
    if not gc: return None
    
    try:
        if sheet_type == 'billing': 
            return gc.open(SHEET_MAIN).get_worksheet(0)
        if sheet_type == 'insurance': 
            return gc.open(SHEET_MAIN).get_worksheet(1)
        if sheet_type == 'auth': 
            return gc.open(SHEET_MAIN).get_worksheet(2)
        
        # New Sheet Logic
        if sheet_type == 'design':
            return gc.open(SHEET_NEW).worksheet("Design")
        if sheet_type == 'ebook':
            return gc.open(SHEET_NEW).worksheet("Ebook")
            
    except Exception as e:
        print(f"Sheet Access Error ({sheet_type}): {e}")
        return None
    return None

# --- CONSTANTS ---
AGENTS_BILLING = ["Arham Kaleem", "Arham Ali", "Haziq", "Anus", "Hasnain"]
AGENTS_INSURANCE = ["Saad"]
PROVIDERS = ["Spectrum", "Insurance", "Xfinity", "Frontier", "Optimum"]
LLC_SPEC = ["Secure Claim Solutions", "Visionary Pathways"]
LLC_INS = ["LMI"]

# --- UTILS ---
def get_timestamp():
    now = datetime.now(TZ_KARACHI)
    return now.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d %H:%M:%S"), now

def get_night_shift_window():
    now = datetime.now(TZ_KARACHI)
    if now.hour < 9:
        start_time = (now - timedelta(days=1)).replace(hour=19, minute=0, second=0, microsecond=0)
    elif now.hour >= 19:
        start_time = now.replace(hour=19, minute=0, second=0, microsecond=0)
    else:
        start_time = now.replace(hour=19, minute=0, second=0, microsecond=0)
    end_time = start_time + timedelta(hours=14)
    return start_time, end_time

def calculate_mongo_stats(collection):
    try:
        start_dt, end_dt = get_night_shift_window()
        pipeline = [
            {"$match": {"created_at": {"$gte": start_dt, "$lte": end_dt}, "status": "Charged"}},
            {"$group": {"_id": "$agent", "total_amount": {"$sum": "$charge_amount"}}}
        ]
        results = list(collection.aggregate(pipeline))
        breakdown = {}
        total = 0.0
        for r in results:
            agent = r.get("_id") or "Unknown"
            amt = r["total_amount"]
            breakdown[agent] = amt
            total += amt
        return {"total": round(total, 2), "breakdown": breakdown}
    except:
        return {"total": 0, "breakdown": {}}

# --- ROUTES ---

@app.get("/", response_class=HTMLResponse)
async def index(request: Request): return templates.TemplateResponse("index.html", {"request": request})

@app.get("/billing", response_class=HTMLResponse)
async def view_billing(request: Request):
    return templates.TemplateResponse("billing.html", {
        "request": request, "agents": AGENTS_BILLING, "providers": PROVIDERS, 
        "llcs": LLC_SPEC, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/insurance", response_class=HTMLResponse)
async def view_insurance(request: Request):
    return templates.TemplateResponse("insurance.html", {
        "request": request, "agents": AGENTS_INSURANCE, "llcs": LLC_INS,
        "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/design", response_class=HTMLResponse)
async def view_design(request: Request):
    return templates.TemplateResponse("design.html", {
        "request": request, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/ebook", response_class=HTMLResponse)
async def view_ebook(request: Request):
    return templates.TemplateResponse("ebook.html", {
        "request": request, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/manager", response_class=HTMLResponse)
async def view_manager(request: Request):
    return templates.TemplateResponse("manager.html", {
        "request": request, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/api/public/night-stats")
async def get_public_stats():
    return {
        "billing": calculate_mongo_stats(billing_col),
        "insurance": calculate_mongo_stats(insurance_col),
        "design": calculate_mongo_stats(design_col),
        "ebook": calculate_mongo_stats(ebook_col)
    }

# --- CHAT ---
@app.get("/api/chat/history")
async def get_chat_history(): return CHAT_HISTORY

@app.post("/api/chat/send")
async def send_chat(sender: str = Form(...), message: str = Form(...), role: str = Form(...)):
    current_time = time_module.time()
    if current_time - CHAT_RATE_LIMIT["start"] > 3600:
        CHAT_RATE_LIMIT["start"] = current_time
        CHAT_RATE_LIMIT["count"] = 0
    if CHAT_RATE_LIMIT["count"] >= 30:
        return JSONResponse({"status": "error", "message": "Limit reached"}, 429)

    CHAT_RATE_LIMIT["count"] += 1
    t_str = datetime.now(TZ_KARACHI).strftime("%I:%M %p")
    msg_data = {"sender": sender, "message": message, "role": role, "time": t_str}
    CHAT_HISTORY.append(msg_data)
    if len(CHAT_HISTORY) > 50: CHAT_HISTORY.pop(0)
    try: pusher_client.trigger('techware-channel', 'new-chat', msg_data)
    except: pass
    return {"status": "success"}

# --- SAVE LEAD ---
@app.post("/api/save-lead")
async def save_lead(
    type: str = Form(...), 
    is_edit: str = Form("false"),
    agent: Optional[str] = Form(None),
    client_name: str = Form(...),
    service: Optional[str] = Form(None), # For Design/Ebook
    charge_amt: str = Form(...),
    phone: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    record_id: Optional[str] = Form(None),
    order_id: Optional[str] = Form(None), # Billing uses order_id
    status: Optional[str] = Form("Pending"),
    # Extra fields for Billing/Insurance
    address: Optional[str] = Form(None),
    card_holder: Optional[str] = Form(None),
    card_number: Optional[str] = Form(None),
    exp_date: Optional[str] = Form(None),
    cvc: Optional[str] = Form(None),
    llc: Optional[str] = Form(None),
    provider: Optional[str] = Form(None),
    pin_code: Optional[str] = Form(""),
    account_number: Optional[str] = Form(""),
    original_timestamp: Optional[str] = Form(None),
    timestamp_mode: Optional[str] = Form("keep")
):
    try:
        clean_charge = float(str(charge_amt).replace('$', '').replace(',', '').strip())
        final_charge_str = f"${clean_charge:.2f}"
    except: 
        clean_charge = 0.0
        final_charge_str = charge_amt 

    # Timestamp Logic
    if is_edit == 'true' and timestamp_mode == 'keep' and original_timestamp:
        timestamp_str = original_timestamp
        try:
            ts_obj = datetime.strptime(original_timestamp, "%Y-%m-%d %H:%M:%S")
            ts_obj = TZ_KARACHI.localize(ts_obj) if ts_obj.tzinfo is None else ts_obj
            date_str = ts_obj.strftime("%Y-%m-%d")
        except:
             date_str, timestamp_str, ts_obj = get_timestamp()
    else:
        date_str, timestamp_str, ts_obj = get_timestamp()

    # ID Logic
    unique_id = str(order_id).strip() if type == 'billing' else str(record_id).strip()
    if not unique_id or unique_id == "None":
        import random, string
        unique_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    # Base Mongo Doc
    mongo_doc = {
        "record_id": unique_id,
        "agent": agent,
        "client_name": client_name,
        "charge_amount": clean_charge,
        "charge_str": final_charge_str,
        "status": status, 
        "created_at": ts_obj,
        "timestamp_str": timestamp_str,
        "date_str": date_str,
        "type": type
    }
    
    # Add Type Specific Fields
    if type in ['billing', 'insurance']:
        mongo_doc.update({
            "phone": phone, "email": email, "address": address, "card_holder": card_holder,
            "card_number": str(card_number), "exp_date": str(exp_date), "cvc": str(cvc),
            "llc": llc, "provider": provider, "pin_code": pin_code, "account_number": account_number
        })
    else:
        # Design / Ebook
        mongo_doc["service"] = service
        mongo_doc["status"] = "Charged" # Default for these as per request "Charge"

    # Select Collection
    if type == 'billing': target_col = billing_col
    elif type == 'insurance': target_col = insurance_col
    elif type == 'design': target_col = design_col
    elif type == 'ebook': target_col = ebook_col

    try:
        # 1. Mongo Update/Insert
        target_col.update_one({"record_id": unique_id}, {"$set": mongo_doc}, upsert=True)

        # 2. Sheets Append (Only New)
        if is_edit != 'true':
            ws = get_worksheet(type)
            if ws:
                if type in ['billing', 'insurance']:
                    row = [unique_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge_str, llc, provider, date_str, "Pending", timestamp_str]
                    if type == 'insurance': row = [unique_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge_str, llc, date_str, "Pending", timestamp_str]
                    else: row.append(pin_code or account_number)
                else:
                    # Design / Ebook: Name, Service, Charge, Date, Timestamp
                    row = [client_name, service, final_charge_str, date_str, timestamp_str]
                ws.append_row(row)

        # 3. Pusher
        if is_edit == 'true':
             pusher_client.trigger('techware-channel', 'lead-edited', {'agent': agent or 'Manager', 'id': unique_id, 'client': client_name, 'type': type})
             return {"status": "success", "message": "Updated"}
        else:
             pusher_client.trigger('techware-channel', 'new-lead', {'agent': agent or 'Unknown', 'amount': final_charge_str, 'type': type})
             return {"status": "success", "message": "Saved"}

    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/inline-edit")
async def inline_edit(
    type: str = Form(...),
    id: str = Form(...),
    field: str = Form(...),
    value: str = Form(...)
):
    try:
        # Map frontend field names to mongo fields
        field_map = {"Name": "client_name", "Service": "service", "Charge": "charge_str"}
        mongo_field = field_map.get(field, field.lower())
        
        # Determine Collection
        if type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        else: return {"status": "error", "message": "Invalid Type"}

        update_data = {mongo_field: value}
        
        # If charge, update float too
        if mongo_field == "charge_str":
             try: update_data["charge_amount"] = float(value.replace('$','').replace(',',''))
             except: pass

        col.update_one({"record_id": id}, {"$set": update_data})
        
        # Notify Manager
        pusher_client.trigger('techware-channel', 'lead-edited', {'agent': 'Inline Edit', 'id': id, 'client': value, 'type': type})
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/get-lead")
async def get_lead(type: str, id: Optional[str] = None, name: Optional[str] = None):
    try:
        if type == 'billing': col = billing_col
        elif type == 'insurance': col = insurance_col
        elif type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        
        # Search by ID (Billing/Insurance)
        if id:
            doc = col.find_one({"record_id": str(id)})
            if not doc: return JSONResponse({"status": "error", "message": "Not Found"}, 404)
            # Normalize keys for frontend
            data = doc
            data['Name'] = doc.get('client_name')
            data['Charge'] = doc.get('charge_str')
            data['Agent Name'] = doc.get('agent')
            data['Timestamp'] = doc.get('timestamp_str')
            return {"status": "success", "data": data}

        # Search by Name (Design/Ebook)
        if name:
            # Case insensitive regex search
            cursor = col.find({"client_name": {"$regex": f"^{re.escape(name)}", "$options": "i"}})
            docs = list(cursor)
            
            if not docs: return JSONResponse({"status": "error", "message": "Not Found"}, 404)
            
            candidates = []
            for d in docs:
                candidates.append({
                    "record_id": d['record_id'],
                    "name": d['client_name'],
                    "service": d.get('service', ''),
                    "charge": d.get('charge_str', ''),
                    "timestamp": d.get('timestamp_str', '')
                })
            
            if len(candidates) == 1:
                return {"status": "success", "data": docs[0]}
            else:
                return {"status": "multiple", "candidates": candidates}

        return {"status": "error", "message": "No ID or Name provided"}

    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.get("/api/manager/data")
async def get_manager_data(token: str):
    try:
        def get_docs(col):
            return [{**d, '_id': str(d['_id']), 'Name': d.get('client_name'), 'Charge': d.get('charge_str'), 'Agent Name': d.get('agent'), 'Timestamp': d.get('timestamp_str')} 
                    for d in col.find().sort("created_at", -1).limit(200)]

        # Aggregation for Totals (Today)
        start_today = datetime.now(TZ_KARACHI).replace(hour=0, minute=0, second=0)
        def get_daily_total(col):
            pipeline = [{"$match": {"created_at": {"$gte": start_today}, "status": "Charged"}},
                        {"$group": {"_id": None, "total": {"$sum": "$charge_amount"}}}]
            res = list(col.aggregate(pipeline))
            return round(res[0]['total'], 2) if res else 0.0

        return {
            "billing": get_docs(billing_col),
            "insurance": get_docs(insurance_col),
            "design": get_docs(design_col),
            "ebook": get_docs(ebook_col),
            "stats_bill": calculate_mongo_stats(billing_col),
            "stats_ins": calculate_mongo_stats(insurance_col),
            "daily_stats": {
                "billing": get_daily_total(billing_col),
                "insurance": get_daily_total(insurance_col),
                "design": get_daily_total(design_col),
                "ebook": get_daily_total(ebook_col)
            }
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/manager/login")
async def manager_login(user_id: str = Form(...), password: str = Form(...)):
    try:
        ws = get_worksheet('auth')
        if not ws: raise Exception("Auth DB Error")
        records = ws.get_all_records() 
        user = next((r for r in records if str(r['ID']) == user_id), None)
        if not user: return JSONResponse({"status": "error", "message": "User not found"}, 401)
        
        stored_pass = str(user['Password'])
        hashed_input = hashlib.sha256(password.encode()).hexdigest()
        if password == stored_pass or hashed_input == stored_pass:
            return {"status": "success", "token": f"auth_{user_id}", "role": "Manager"}
        return JSONResponse({"status": "error", "message": "Invalid password"}, 401)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/manager/update_status")
async def update_status(type: str = Form(...), id: str = Form(...), status: str = Form(...)):
    try:
        if type == 'billing': col = billing_col
        elif type == 'insurance': col = insurance_col
        else: return {"status": "error"}
        
        res = col.find_one_and_update({"record_id": str(id)}, {"$set": {"status": status}}, return_document=True)
        if not res: return {"status": "error"}

        pusher_client.trigger('techware-channel', 'status-update', {
            'id': id, 'status': status, 'type': type,
            'agent': res.get('agent'), 'client': res.get('client_name')
        })
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/delete-lead")
async def delete_lead(type: str = Form(...), id: str = Form(...)):
    try:
        if type == 'billing': col = billing_col
        elif type == 'insurance': col = insurance_col
        elif type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        col.delete_one({"record_id": str(id)})
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
