import os
import json
import gspread
import pytz
import requests
import hashlib
import time as time_module
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Optional
from dotenv import load_dotenv
import pusher
from pymongo import MongoClient
from bson import ObjectId

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
    
    print("✅ Connected to MongoDB successfully.")
except Exception as e:
    print(f"❌ MongoDB Connection Error: {e}")

# --- CHAT SETUP (Global List) ---
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
SHEET_SECONDARY = "E-Books and Design from Portal"

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
        if sheet_type in ['billing', 'insurance', 'auth']:
            sh = gc.open(SHEET_MAIN)
            if sheet_type == 'billing': return sh.worksheet("Sheet1")
            if sheet_type == 'insurance': return sh.worksheet("Sheet2")
            if sheet_type == 'auth': return sh.get_worksheet(2)
            
        elif sheet_type in ['design', 'ebook']:
            sh = gc.open(SHEET_SECONDARY)
            # Tabs: "Design", "Ebook"
            if sheet_type == 'design': return sh.worksheet("Design")
            if sheet_type == 'ebook': return sh.worksheet("Ebook")
            
    except Exception as e:
        print(f"Sheet Access Error ({sheet_type}): {e}")
        gc = None 
        return None
    return None

# --- UTILS ---
def send_pushbullet(title, body):
    token = os.getenv("PUSHBULLET_TOKEN")
    if not token: return
    try:
        requests.post("https://api.pushbullet.com/v2/pushes", 
                      json={"type": "note", "title": title, "body": body}, 
                      headers={"Access-Token": token, "Content-Type": "application/json"})
    except: pass

def get_timestamp():
    now = datetime.now(TZ_KARACHI)
    return now.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d %H:%M:%S"), now

def get_today_total(collection):
    """Calculates total charged amount for TODAY (Midnight to Midnight)."""
    try:
        today_start = datetime.now(TZ_KARACHI).replace(hour=0, minute=0, second=0, microsecond=0)
        pipeline = [
            {"$match": {"created_at": {"$gte": today_start}, "status": "Charged"}},
            {"$group": {"_id": None, "total": {"$sum": "$charge_amount"}}}
        ]
        res = list(collection.aggregate(pipeline))
        return round(res[0]['total'], 2) if res else 0.0
    except: return 0.0

# --- ROUTES ---

@app.get("/", response_class=HTMLResponse)
async def index(request: Request): return templates.TemplateResponse("index.html", {"request": request})

@app.get("/billing", response_class=HTMLResponse)
async def view_billing(request: Request):
    return templates.TemplateResponse("billing.html", {
        "request": request, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/insurance", response_class=HTMLResponse)
async def view_insurance(request: Request):
    return templates.TemplateResponse("insurance.html", {
        "request": request, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/design", response_class=HTMLResponse)
async def view_design(request: Request):
    return templates.TemplateResponse("design.html", {"request": request, "type": "design"})

@app.get("/ebooks", response_class=HTMLResponse)
async def view_ebooks(request: Request):
    return templates.TemplateResponse("ebooks.html", {"request": request, "type": "ebook"})

@app.get("/manager", response_class=HTMLResponse)
async def view_manager(request: Request):
    return templates.TemplateResponse("manager.html", {
        "request": request, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

# --- API ENDPOINTS ---

@app.get("/api/search-lead")
async def search_lead_by_name(type: str, name: str):
    try:
        col = None
        if type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        else: return JSONResponse({"status": "error", "message": "Invalid Type"}, 400)

        regex = {"$regex": f"^{name}", "$options": "i"} 
        cursor = col.find({"client_name": regex}).sort("created_at", -1).limit(10)
        
        results = []
        for doc in cursor:
            doc['_id'] = str(doc['_id'])
            # Ensure charge is formatted
            doc['charge_str'] = doc.get('charge_str') or f"${doc.get('charge_amount', 0)}"
            results.append(doc)
            
        return {"status": "success", "data": results}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/save-lead")
async def save_lead(
    request: Request,
    type: str = Form(...), 
    is_edit: str = Form("false"),
    agent: str = Form(...),
    client_name: str = Form(...),
    charge_amt: str = Form(...),
    # Optional fields
    phone: Optional[str] = Form(""),
    address: Optional[str] = Form(""),
    email: Optional[str] = Form(""),
    card_holder: Optional[str] = Form(""),
    card_number: Optional[str] = Form(""),
    exp_date: Optional[str] = Form(""),
    cvc: Optional[str] = Form(""),
    llc: Optional[str] = Form(""),
    status: Optional[str] = Form("Pending"),
    record_id: Optional[str] = Form(None),
    service: Optional[str] = Form(""), 
    provider: Optional[str] = Form(None),
    pin_code: Optional[str] = Form(""),
    account_number: Optional[str] = Form(""),  
    original_timestamp: Optional[str] = Form(None),
    timestamp_mode: Optional[str] = Form("keep")
):
    try:
        clean_charge = float(str(charge_amt).replace('$', '').replace(',', '').strip() or 0)
        final_charge_str = f"${clean_charge:.2f}"

        if is_edit == 'true' and timestamp_mode == 'keep' and original_timestamp:
            try:
                ts_obj = datetime.strptime(original_timestamp, "%Y-%m-%d %H:%M:%S")
                ts_obj = TZ_KARACHI.localize(ts_obj) if ts_obj.tzinfo is None else ts_obj
                date_str = ts_obj.strftime("%Y-%m-%d")
                timestamp_str = original_timestamp
            except:
                 date_str, timestamp_str, ts_obj = get_timestamp()
        else:
            date_str, timestamp_str, ts_obj = get_timestamp()

        # Generate ID if missing
        if not record_id:
             prefix = type[:1].upper()
             record_id = f"{prefix}{int(time_module.time()*1000)}"
        
        target_col = None
        if type == 'billing': target_col = billing_col
        elif type == 'insurance': target_col = insurance_col
        elif type == 'design': target_col = design_col
        elif type == 'ebook': target_col = ebook_col
        
        mongo_doc = {
            "record_id": record_id,
            "agent": agent,
            "client_name": client_name,
            "charge_amount": clean_charge,
            "charge_str": final_charge_str,
            "status": status,
            "created_at": ts_obj,
            "timestamp_str": timestamp_str,
            "date_str": date_str,
            "type": type,
            "phone": phone, "address": address, "email": email,
            "card_holder": card_holder, "card_number": str(card_number),
            "exp_date": str(exp_date), "cvc": str(cvc),
            "llc": llc, "provider": provider, "pin_code": pin_code,
            "account_number": account_number, "service": service
        }

        # A. UPDATE MONGODB
        target_col.update_one({"record_id": record_id}, {"$set": mongo_doc}, upsert=True)

        # B. UPDATE SHEETS (New Leads Only)
        if is_edit != 'true':
            ws = get_worksheet(type)
            if ws:
                if type in ['design', 'ebook']:
                    row_data = [client_name, service, final_charge_str, date_str, timestamp_str]
                    ws.append_row(row_data)
                elif type == 'billing':
                    row_data = [record_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge_str, llc, provider, date_str, "Pending", timestamp_str, pin_code, account_number]
                    ws.append_row(row_data)
                elif type == 'insurance':
                    row_data = [record_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge_str, llc, date_str, "Pending", timestamp_str]
                    ws.append_row(row_data)

        # C. PUSHER LOGIC
        
        # 1. New Lead (ANY DEPT) -> Ring Manager & Update Stats
        if is_edit != 'true':
            pusher_client.trigger('techware-channel', 'new-lead', {
                'agent': agent, 'amount': final_charge_str, 'type': type, 'message': f"New {type} Lead"
            })
            # Only send pushbullet for Bill/Ins per old logic, or enable all if desired.
            if type in ['billing', 'insurance']:
                send_pushbullet(f"New {type} Lead", f"{agent} - {final_charge_str}")

        # 2. Edit Lead (Billing Only) -> Ring Billing Portal
        if is_edit == 'true' and type == 'billing':
            pusher_client.trigger('techware-channel', 'lead-edited', {
                'id': record_id, 'type': 'billing', 'agent': agent
            })

        return {"status": "success", "message": "Saved Successfully"}

    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/manager/update_status")
async def update_status(type: str = Form(...), id: str = Form(...), status: str = Form(...)):
    try:
        col = None
        if type == 'billing': col = billing_col
        elif type == 'insurance': col = insurance_col
        elif type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        
        result = col.find_one_and_update(
            {"record_id": str(id)},
            {"$set": {"status": status}},
            return_document=True
        )
        if not result: raise Exception("ID not found")
        
        # Update Manager Stats via Pusher
        pusher_client.trigger('techware-channel', 'status-update', {
            'id': id, 'status': status, 'type': type,
            'client': result.get('client_name')
        })
        
        # Ring Billing on Edit
        if type == 'billing':
             pusher_client.trigger('techware-channel', 'lead-edited', {'id': id, 'type': 'billing'})

        return {"status": "success", "message": "Status Updated"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/manager/data")
async def get_manager_data(token: str):
    try:
        def get_docs(col):
            cursor = col.find().sort("created_at", -1).limit(100)
            data = []
            for d in cursor:
                d['_id'] = str(d['_id'])
                d['Name'] = d.get('client_name')
                d['Charge'] = d.get('charge_str')
                d['Service'] = d.get('service', '-')
                d['Timestamp'] = d.get('timestamp_str')
                d['Order ID'] = d.get('record_id')
                data.append(d)
            return data

        # Get Daily Totals for the 4 Boxes
        totals = {
            "billing": get_today_total(billing_col),
            "insurance": get_today_total(insurance_col),
            "design": get_today_total(design_col),
            "ebook": get_today_total(ebook_col)
        }

        return {
            "billing": get_docs(billing_col), 
            "insurance": get_docs(insurance_col),
            "design": get_docs(design_col),
            "ebook": get_docs(ebook_col),
            "totals": totals
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": "Data sync failed"}, 500)

@app.post("/api/chat/send")
async def send_chat(sender: str = Form(...), message: str = Form(...), role: str = Form(...), dept: str = Form(...)):
    current_time = time_module.time()
    if current_time - CHAT_RATE_LIMIT["start"] > 3600:
        CHAT_RATE_LIMIT["start"] = current_time
        CHAT_RATE_LIMIT["count"] = 0
    if CHAT_RATE_LIMIT["count"] >= 50:
        return JSONResponse({"status": "error", "message": "Chat limit reached."}, 429)

    CHAT_RATE_LIMIT["count"] += 1
    t_str = datetime.now(TZ_KARACHI).strftime("%I:%M %p")
    msg_data = {"sender": sender, "message": message, "role": role, "dept": dept, "time": t_str}
    
    CHAT_HISTORY.append(msg_data)
    if len(CHAT_HISTORY) > 50: CHAT_HISTORY.pop(0)

    try: pusher_client.trigger('techware-channel', 'new-chat', msg_data)
    except: pass
    return {"status": "success"}

@app.get("/api/chat/history")
async def get_chat_history():
    return CHAT_HISTORY

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
