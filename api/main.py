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

# --- MONGODB SETUP (The New "Brain") ---
# We connect once. MongoDB handles the connection pool efficiently.
try:
    mongo_client = MongoClient(MONGO_URI)
    db = mongo_client["twh_portal"]
    
    # Define the two collections as requested
    billing_col = db["billing"]
    insurance_col = db["insurance"]
    
    print("Connected to MongoDB successfully.")
except Exception as e:
    print(f"MongoDB Connection Error: {e}")
    # We don't stop the app, but DB features will fail if this is broken.

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

# --- SHEETS SETUP (Backup / Write-Only) ---
gc = None
SHEET_NAME = "Company_Transactions"

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
        sh = gc.open(SHEET_NAME)
        if sheet_type == 'billing': return sh.get_worksheet(0)
        if sheet_type == 'insurance': return sh.get_worksheet(1)
        if sheet_type == 'auth': return sh.get_worksheet(2)
    except Exception as e:
        print(f"Sheet Access Error: {e}")
        gc = None 
        return None
    return None

# --- CONSTANTS ---
AGENTS_BILLING = ["Arham Kaleem", "Arham Ali", "Haziq", "Anus", "Hasnain"]
AGENTS_INSURANCE = ["Saad"]
PROVIDERS = ["Spectrum", "Insurance", "Xfinity", "Frontier", "Optimum"]
LLC_SPEC = ["Secure Claim Solutions", "Visionary Pathways"]
LLC_INS = ["LMI"]

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

def get_night_shift_window():
    """Calculates the start and end datetime for the current 'Night Shift'."""
    now = datetime.now(TZ_KARACHI)
    
    # Shift Definition: 7 PM (19:00) to 9 AM (09:00) next day
    # If currently between Midnight and 9 AM, the shift started Yesterday 7 PM
    if now.hour < 9:
        start_time = (now - timedelta(days=1)).replace(hour=19, minute=0, second=0, microsecond=0)
    # If currently after 7 PM, the shift started Today 7 PM
    elif now.hour >= 19:
        start_time = now.replace(hour=19, minute=0, second=0, microsecond=0)
    # If currently between 9 AM and 7 PM (Day time), we show last night's stats or today's pending? 
    # Usually we just look at the "upcoming" or "active" night window.
    # Let's stick to the standard logic: If it's day time (e.g. 2 PM), show stats from "Yesterday 7PM" to "Today 9AM" (closed shift)
    # or reset for tonight. Let's assume reset logic:
    else:
        # It's day time. Reset window to start tonight.
        start_time = now.replace(hour=19, minute=0, second=0, microsecond=0)

    end_time = start_time + timedelta(hours=14) # 19:00 + 14h = 09:00
    return start_time, end_time

def calculate_mongo_stats(collection):
    """
    Asks MongoDB to calculate the totals. No CPU usage on Python side.
    """
    try:
        start_dt, end_dt = get_night_shift_window()
        
        pipeline = [
            {
                "$match": {
                    "created_at": {"$gte": start_dt, "$lte": end_dt},
                    "status": "Charged"
                }
            },
            {
                "$group": {
                    "_id": "$agent",
                    "total_amount": {"$sum": "$charge_amount"}
                }
            }
        ]
        
        results = list(collection.aggregate(pipeline))
        
        breakdown = {}
        total = 0.0
        
        for r in results:
            agent = r["_id"]
            amt = r["total_amount"]
            breakdown[agent] = amt
            total += amt
            
        return {"total": round(total, 2), "breakdown": breakdown}
    except Exception as e:
        print(f"Mongo Stats Error: {e}")
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

@app.get("/manager", response_class=HTMLResponse)
async def view_manager(request: Request):
    return templates.TemplateResponse("manager.html", {
        "request": request, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/api/public/night-stats")
async def get_public_stats():
    # DIRECT MONGO QUERY - No Pandas, No Heavy Processing
    bill_stats = calculate_mongo_stats(billing_col)
    ins_stats = calculate_mongo_stats(insurance_col)
    
    return {
        "billing": bill_stats,
        "insurance": ins_stats
    }

# --- CHAT ENDPOINTS ---
@app.get("/api/chat/history")
async def get_chat_history():
    return CHAT_HISTORY

@app.post("/api/chat/send")
async def send_chat(sender: str = Form(...), message: str = Form(...), role: str = Form(...)):
    current_time = time_module.time()
    if current_time - CHAT_RATE_LIMIT["start"] > 3600:
        CHAT_RATE_LIMIT["start"] = current_time
        CHAT_RATE_LIMIT["count"] = 0
    if CHAT_RATE_LIMIT["count"] >= 30:
        return JSONResponse({"status": "error", "message": "Global chat limit reached."}, 429)

    CHAT_RATE_LIMIT["count"] += 1
    t_str = datetime.now(TZ_KARACHI).strftime("%I:%M %p")
    msg_data = {"sender": sender, "message": message, "role": role, "time": t_str}
    
    CHAT_HISTORY.append(msg_data)
    if len(CHAT_HISTORY) > 50: CHAT_HISTORY.pop(0)

    try: pusher_client.trigger('techware-channel', 'new-chat', msg_data)
    except: pass
    return {"status": "success"}

@app.post("/api/save-lead")
async def save_lead(
    request: Request,
    type: str = Form(...), 
    is_edit: str = Form("false"),
    agent: str = Form(...),
    client_name: str = Form(...),
    phone: str = Form(...),
    address: str = Form(...),
    email: str = Form(...),
    card_holder: str = Form(...),
    card_number: str = Form(...),
    exp_date: str = Form(...),
    cvc: str = Form(...),
    charge_amt: str = Form(...),
    llc: str = Form(...),
    status: Optional[str] = Form("Pending"),
    order_id: Optional[str] = Form(None), # Billing ID
    record_id: Optional[str] = Form(None), # Insurance ID
    provider: Optional[str] = Form(None),
    pin_code: Optional[str] = Form(""),
    account_number: Optional[str] = Form(""),  
    original_timestamp: Optional[str] = Form(None),
    timestamp_mode: Optional[str] = Form("keep"),
    row_index: Optional[int] = Form(None) # Used for Sheets only
):
    # 1. PREPARE DATA
    try:
        clean_charge = float(str(charge_amt).replace('$', '').replace(',', '').strip())
        final_charge_str = f"${clean_charge:.2f}"
    except: 
        clean_charge = 0.0
        final_charge_str = charge_amt 

    # Timestamp Logic
    if is_edit == 'true' and timestamp_mode == 'keep' and original_timestamp:
        # Try to parse original timestamp back to datetime for Mongo
        try:
            # Assuming format "YYYY-MM-DD HH:MM:SS"
            ts_obj = datetime.strptime(original_timestamp, "%Y-%m-%d %H:%M:%S")
            # Localize if needed, or assume naive is Karachi time
            ts_obj = TZ_KARACHI.localize(ts_obj) if ts_obj.tzinfo is None else ts_obj
            date_str = ts_obj.strftime("%Y-%m-%d")
            timestamp_str = original_timestamp
        except:
             # Fallback if parsing fails
             date_str, timestamp_str, ts_obj = get_timestamp()
    else:
        date_str, timestamp_str, ts_obj = get_timestamp()

    # ID Logic
    # We use the user-provided ID as the unique identifier
    unique_id = str(order_id).strip() if type == 'billing' else str(record_id).strip()
    
    # 2. BUILD DOCUMENT FOR MONGODB
    mongo_doc = {
        "record_id": unique_id,
        "agent": agent,
        "client_name": client_name,
        "phone": phone,
        "address": address,
        "email": email,
        "card_holder": card_holder,
        "card_number": str(card_number),
        "exp_date": str(exp_date),
        "cvc": str(cvc),
        "charge_amount": clean_charge, # Number for math
        "charge_str": final_charge_str, # String for display
        "llc": llc,
        "provider": provider,
        "pin_code": pin_code,
        "account_number": account_number,
        "status": status if is_edit == 'true' else "Pending",
        "created_at": ts_obj, # Date Object for queries
        "timestamp_str": timestamp_str,
        "date_str": date_str,
        "type": type
    }

    # 3. DB OPERATION (Dual Write)
    try:
        # A. WRITE TO MONGODB (Primary "Brain")
        target_col = billing_col if type == 'billing' else insurance_col
        
        # Upsert: If ID exists, update it. If not, insert new.
        target_col.update_one(
            {"record_id": unique_id}, 
            {"$set": mongo_doc}, 
            upsert=True
        )

        # B. WRITE TO SHEETS (Secondary "Backup")
        # We only append new rows to sheets. Editing sheets is slow and CPU heavy, so we skip editing sheets.
        # The user said "store the lead in sheet and that's it".
        if is_edit != 'true':
            ws = get_worksheet(type)
            if ws:
                if type == 'billing':
                    row = [unique_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge_str, llc, provider, date_str, "Pending", timestamp_str, pin_code or account_number]
                else:
                    row = [unique_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge_str, llc, date_str, "Pending", timestamp_str]
                ws.append_row(row)

        # C. NOTIFY
        if is_edit == 'true':
            pusher_client.trigger('techware-channel', 'lead-edited', {
                'agent': agent, 'id': unique_id, 'client': client_name, 'message': f"Edited by {agent}"
            })
            return {"status": "success", "message": "Lead Updated (Database)"}
        else:
            pusher_client.trigger('techware-channel', 'new-lead', {
                'agent': agent, 'amount': final_charge_str, 'type': type, 'message': f"New Lead: {final_charge_str}"
            })
            send_pushbullet(f"New {type} Lead", f"{agent} - {final_charge_str}")
            return {"status": "success", "message": "Lead Saved Successfully"}

    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/delete-lead")
async def delete_lead(type: str = Form(...), id: str = Form(...)):
    try:
        target_col = billing_col if type == 'billing' else insurance_col
        result = target_col.delete_one({"record_id": str(id)})
        
        if result.deleted_count > 0:
            return {"status": "success", "message": "Deleted from Database"}
        return {"status": "error", "message": "ID not found in Database"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/get-lead")
async def get_lead(type: str, id: str):
    try:
        target_col = billing_col if type == 'billing' else insurance_col
        # Find by ID
        doc = target_col.find_one({"record_id": str(id)})
        
        if not doc:
            return JSONResponse({"status": "error", "message": "Not Found"}, 404)
        
        # Convert Mongo format to Frontend format
        data = {
            "Agent Name": doc.get("agent"),
            "Name": doc.get("client_name"),
            "Ph Number": doc.get("phone"),
            "Address": doc.get("address"),
            "Email": doc.get("email"),
            "Card Holder Name": doc.get("card_holder"),
            "Card Number": doc.get("card_number"),
            "Expiry Date": doc.get("exp_date"),
            "CVC": doc.get("cvc"),
            "Charge Amount": doc.get("charge_str"),
            "LLC": doc.get("llc"),
            "Provider": doc.get("provider"),
            "Timestamp": doc.get("timestamp_str"),
            "Status": doc.get("status"),
            "Record_ID": doc.get("record_id"),
            "PIN Code": doc.get("pin_code"),
            "Account Number": doc.get("account_number")
        }
        return {"status": "success", "data": data}

    except Exception as e: 
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/manager/login")
async def manager_login(user_id: str = Form(...), password: str = Form(...)):
    # Standard Gspread Login (No Pandas)
    try:
        ws = get_worksheet('auth')
        if not ws: raise Exception("Auth DB Error")
        
        # Get all records as list of dicts
        records = ws.get_all_records() 
        
        # Find user
        user = next((r for r in records if str(r['ID']) == user_id), None)
        
        if not user:
            return JSONResponse({"status": "error", "message": "User not found"}, 401)
        
        stored_pass = str(user['Password'])
        hashed_input = hashlib.sha256(password.encode()).hexdigest()
        
        if password == stored_pass or hashed_input == stored_pass:
            return {"status": "success", "token": f"auth_{user_id}", "role": "Manager"}
        
        return JSONResponse({"status": "error", "message": "Invalid password"}, 401)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.get("/api/manager/data")
async def get_manager_data(token: str):
    # Fetch Data from Mongo (Limit to last 200 for performance)
    try:
        # 1. Fetch Raw Data (Recent)
        bill_cursor = billing_col.find().sort("created_at", -1).limit(200)
        ins_cursor = insurance_col.find().sort("created_at", -1).limit(200)
        
        # Convert Mongo Docs to simple Dicts for JSON
        def clean_docs(cursor):
            docs = []
            for d in cursor:
                d['_id'] = str(d['_id']) # ObjectId not serializable
                # Map keys to match what frontend expects
                d['Agent Name'] = d.get('agent')
                d['Charge'] = d.get('charge_str')
                d['Status'] = d.get('status')
                d['Timestamp'] = d.get('timestamp_str')
                d['Record_ID'] = d.get('record_id')
                # ... add other fields if analysis grid needs them
                # But mostly Manager grid uses Status, Charge, Agent, ID
                docs.append(d)
            return docs

        bill_data = clean_docs(bill_cursor)
        ins_data = clean_docs(ins_cursor)
        
        # 2. Calculate Stats (Today, Night, Pending) via Aggregation
        # We can reuse calculate_mongo_stats for the Night part
        night_bill = calculate_mongo_stats(billing_col)
        night_ins = calculate_mongo_stats(insurance_col)
        
        # Calculate Pending Count
        pending_bill = billing_col.count_documents({"status": "Pending"})
        pending_ins = insurance_col.count_documents({"status": "Pending"})

        # Calculate Today's Total
        today_start = datetime.now(TZ_KARACHI).replace(hour=0, minute=0, second=0)
        today_pipeline = [
            {"$match": {"created_at": {"$gte": today_start}, "status": "Charged"}},
            {"$group": {"_id": None, "total": {"$sum": "$charge_amount"}}}
        ]
        
        res_b = list(billing_col.aggregate(today_pipeline))
        today_bill_total = res_b[0]['total'] if res_b else 0.0
        
        res_i = list(insurance_col.aggregate(today_pipeline))
        today_ins_total = res_i[0]['total'] if res_i else 0.0
        
        stats_bill = {
            "today": round(today_bill_total, 2),
            "night": night_bill['total'],
            "pending": pending_bill,
            "breakdown": night_bill['breakdown']
        }
        
        stats_ins = {
            "today": round(today_ins_total, 2),
            "night": night_ins['total'],
            "pending": pending_ins,
            "breakdown": night_ins['breakdown']
        }

        return {
            "billing": bill_data, 
            "insurance": ins_data, 
            "stats_bill": stats_bill, 
            "stats_ins": stats_ins
        }
    except Exception as e:
        print(f"Manager Data Error: {e}")
        return JSONResponse({"status": "error", "message": "Data sync failed"}, 500)

@app.post("/api/manager/update_status")
async def update_status(type: str = Form(...), id: str = Form(...), status: str = Form(...)):
    try:
        target_col = billing_col if type == 'billing' else insurance_col
        
        # Update Mongo Only
        result = target_col.find_one_and_update(
            {"record_id": str(id)},
            {"$set": {"status": status}},
            return_document=True
        )
        
        if not result:
            raise Exception("ID not found in DB")
            
        agent_name = result.get('agent', 'Unknown')
        client_name = result.get('client_name', 'Client')
        
        pusher_client.trigger('techware-channel', 'status-update', {
            'id': id, 'status': status, 'type': type,
            'agent': agent_name, 'client': client_name
        })

        return {"status": "success", "message": "Updated in Database"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
