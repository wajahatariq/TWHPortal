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
        if sheet_type in ['billing', 'insurance', 'auth']:
            sh = gc.open(SHEET_MAIN)
            if sheet_type == 'billing': return sh.get_worksheet(0)
            if sheet_type == 'insurance': return sh.get_worksheet(1)
            if sheet_type == 'auth': return sh.get_worksheet(2)
            
        if sheet_type in ['design', 'ebook']:
            sh = gc.open(SHEET_NEW)
            if sheet_type == 'design': return sh.worksheet("Design")
            if sheet_type == 'ebook': return sh.worksheet("Ebook")
            
    except Exception as e:
        print(f"Sheet Access Error ({sheet_type}): {e}")
        gc = None 
        return None
    return None

# --- CONSTANTS ---
AGENTS_BILLING = ["Arham Kaleem", "Arham Ali", "Haziq", "Anus", "Hasnain"]
AGENTS_INSURANCE = ["Saad"]
AGENTS_DESIGN = ["Taha"]
AGENTS_EBOOK = ["Huzaifa", "Haseeb"]

PROVIDERS = ["Spectrum", "Insurance", "Xfinity", "Frontier", "Optimum"]
LLC_SPEC = ["Secure Claim Solutions", "Visionary Pathways"]
LLC_INS = ["Secure Claim Solutions"]

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

def get_shift_start_time():
    now = datetime.now(TZ_KARACHI)
    if now.hour < 21:
        start = (now - timedelta(days=1)).replace(hour=21, minute=0, second=0, microsecond=0)
    else:
        start = now.replace(hour=21, minute=0, second=0, microsecond=0)
    return start

def calculate_mongo_stats(collection, dept_type):
    try:
        start_time = get_shift_start_time()
        
        if dept_type in ['billing', 'insurance']:
            end_time = start_time + timedelta(hours=10)
            status_filter = {"status": "Charged"}
        else:
            end_time = start_time + timedelta(hours=23, minutes=59, seconds=59)
            status_filter = {} 

        match_query = {
            "created_at": {"$gte": start_time, "$lte": end_time},
            **status_filter
        }

        pipeline = [
            {"$match": match_query},
            {"$group": {"_id": "$agent", "total": {"$sum": "$charge_amount"}}}
        ]
        results = list(collection.aggregate(pipeline))
        
        total = sum(r["total"] for r in results)
        breakdown = {r["_id"]: r["total"] for r in results}

        return {
            "total": round(total, 2),
            "breakdown": breakdown,
            "today": round(total, 2), 
            "night": round(total, 2)
        }

    except Exception as e:
        print(f"Stats Error ({dept_type}): {e}")
        return {"total": 0, "breakdown": {}, "today": 0, "night": 0}

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
        "request": request, "agents": AGENTS_DESIGN, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/ebook", response_class=HTMLResponse)
async def view_ebook(request: Request):
    return templates.TemplateResponse("ebook.html", {
        "request": request, "agents": AGENTS_EBOOK, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/manager", response_class=HTMLResponse)
async def view_manager(request: Request):
    return templates.TemplateResponse("manager.html", {
        "request": request, "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/api/public/night-stats")
async def get_public_stats():
    return {
        "billing": calculate_mongo_stats(billing_col, 'billing'),
        "insurance": calculate_mongo_stats(insurance_col, 'insurance'),
        "design": calculate_mongo_stats(design_col, 'design'),
        "ebook": calculate_mongo_stats(ebook_col, 'ebook')
    }

# --- CHAT ENDPOINTS ---
@app.get("/api/chat/history")
async def get_chat_history(): return CHAT_HISTORY

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
    charge_amt: str = Form(...),
    phone: Optional[str] = Form(""),
    address: Optional[str] = Form(""),
    email: Optional[str] = Form(""),
    card_holder: Optional[str] = Form(""),
    card_number: Optional[str] = Form(""),
    exp_date: Optional[str] = Form(""),
    cvc: Optional[str] = Form(""),
    llc: Optional[str] = Form(""),
    status: Optional[str] = Form("Pending"),
    order_id: Optional[str] = Form(None),
    record_id: Optional[str] = Form(None),
    provider: Optional[str] = Form(""), 
    pin_code: Optional[str] = Form(""),
    account_number: Optional[str] = Form(""),  
    original_timestamp: Optional[str] = Form(None),
    timestamp_mode: Optional[str] = Form("keep"),
    row_index: Optional[int] = Form(None)
):
    try:
        clean_charge = float(str(charge_amt).replace('$', '').replace(',', '').strip())
        final_charge_str = f"${clean_charge:.2f}"
    except: 
        clean_charge = 0.0
        final_charge_str = charge_amt 

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

    unique_id = str(order_id).strip() if type == 'billing' else str(record_id).strip()
    
    if type == 'billing': target_col = billing_col
    elif type == 'insurance': target_col = insurance_col
    elif type == 'design': target_col = design_col
    elif type == 'ebook': target_col = ebook_col
    else: return JSONResponse({"status": "error", "message": "Invalid Type"}, 400)

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
        "charge_amount": clean_charge,
        "charge_str": final_charge_str,
        "llc": llc,
        "provider": provider,
        "pin_code": pin_code,
        "account_number": account_number,
        "status": status if is_edit == 'true' else "Pending",
        "created_at": ts_obj,
        "timestamp_str": timestamp_str,
        "date_str": date_str,
        "type": type
    }

    try:
        target_col.update_one({"record_id": unique_id}, {"$set": mongo_doc}, upsert=True)

        if is_edit != 'true':
            ws = get_worksheet(type)
            if ws:
                if type == 'billing':
                    row_data = [unique_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge_str, llc, provider, date_str, "Pending", timestamp_str, pin_code or account_number]
                elif type == 'insurance':
                   row_data = [unique_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge_str, llc, date_str, "Pending", timestamp_str]
                elif type in ['design', 'ebook']:
                    row_data = [client_name, provider, final_charge_str, date_str, timestamp_str]
                
                ws.append_row(row_data)

        if is_edit == 'true':
            pusher_client.trigger('techware-channel', 'lead-edited', {'agent': agent, 'id': unique_id, 'client': client_name, 'type': type, 'message': f"Edited by {agent}"})
            return {"status": "success", "message": "Lead Updated"}
        else:
            # UPDATED: Included 'client' in the payload
            pusher_client.trigger('techware-channel', 'new-lead', {
                'agent': agent, 
                'amount': final_charge_str, 
                'client': client_name, 
                'type': type, 
                'message': f"New {type.title()} Lead"
            })
            send_pushbullet(f"New {type} Lead", f"{agent} - {final_charge_str}")
            return {"status": "success", "message": "Lead Saved"}

    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/update_field")
async def update_field_inline(
    type: str = Form(...),
    id: str = Form(...),
    field: str = Form(...),
    value: str = Form(...)
):
    try:
        # UPDATED: Added billing and insurance to allowed types
        if type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        elif type == 'billing': col = billing_col
        elif type == 'insurance': col = insurance_col
        else: return JSONResponse({"status": "error", "message": "Invalid Type"}, 400)

        db_field = field
        # Map frontend field names to DB keys if they differ
        if field == 'Name': db_field = 'client_name'
        if field == 'Service' or field == 'Provider': db_field = 'provider'
        if field == 'Charge': db_field = 'charge_str'
        if field == 'Phone': db_field = 'phone'
        if field == 'Email': db_field = 'email'

        col.update_one({"record_id": id}, {"$set": {db_field: value}})
        
        pusher_client.trigger('techware-channel', 'lead-edited', {'agent': 'Inline', 'id': id, 'client': 'Record', 'type': type, 'message': "Inline Edit"})
        return {"status": "success"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)
      
@app.post("/api/delete-lead")
async def delete_lead(type: str = Form(...), id: str = Form(...)):
    try:
        if type == 'billing': col = billing_col
        elif type == 'insurance': col = insurance_col
        elif type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        else: return {"status": "error"}
        
        result = col.delete_one({"record_id": str(id)})
        if result.deleted_count > 0:
            return {"status": "success", "message": "Deleted from Database"}
        return {"status": "error", "message": "ID not found in Database"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/get-lead")
async def get_lead(type: str, id: str = None, limit: int = None):
    try:
        if type == 'billing': col = billing_col
        elif type == 'insurance': col = insurance_col
        elif type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        
        if limit:
                    cursor = col.find().sort("created_at", -1).limit(limit)
                    results = []
                    for doc in cursor:
                        doc['_id'] = str(doc['_id'])
                        # Map ALL fields for the table
                        doc['Record_ID'] = doc.get('record_id')
                        doc['Agent'] = doc.get('agent')
                        doc['Name'] = doc.get('client_name')
                        doc['Phone'] = doc.get('phone')
                        doc['Email'] = doc.get('email')
                        doc['Address'] = doc.get('address')
                        doc['CardHolder'] = doc.get('card_holder')
                        doc['CardNumber'] = doc.get('card_number')
                        doc['ExpDate'] = doc.get('exp_date')
                        doc['CVC'] = doc.get('cvc')
                        doc['Charge'] = doc.get('charge_str')
                        doc['Provider'] = doc.get('provider')
                        doc['LLC'] = doc.get('llc')
                        doc['AccountNo'] = doc.get('account_number')
                        doc['PIN'] = doc.get('pin_code')
                        doc['Status'] = doc.get('status')
                        doc['Timestamp'] = doc.get('timestamp_str')
                        results.append(doc)
                    return {"status": "success", "data": results}

        if id:
            doc = col.find_one({"record_id": str(id)})
            if not doc:
                return JSONResponse({"status": "error", "message": "Not Found"}, 404)
            
            data = {
                "Agent Name": doc.get("agent"),
                "Name": doc.get("client_name"),
                "Client Name": doc.get("client_name"),
                "Ph Number": doc.get("phone"),
                "Address": doc.get("address"),
                "Email": doc.get("email"),
                "Card Holder Name": doc.get("card_holder"),
                "Card Number": doc.get("card_number"),
                "Expiry Date": doc.get("exp_date"),
                "CVC": doc.get("cvc"),
                "Charge Amount": doc.get("charge_str"),
                "Charge": doc.get("charge_str"),
                "LLC": doc.get("llc"),
                "Provider": doc.get("provider"),
                "Timestamp": doc.get("timestamp_str"),
                "Status": doc.get("status"),
                "Record_ID": doc.get("record_id"),
                "Order ID": doc.get("record_id"),
                "PIN Code": doc.get("pin_code"),
                "Account Number": doc.get("account_number")
            }
            return {"status": "success", "data": data}

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

@app.get("/api/manager/data")
async def get_manager_data(token: str):
    try:
        def clean_docs(cursor):
            docs = []
            for d in cursor:
                d['_id'] = str(d['_id'])
                d['Agent Name'] = d.get('agent')
                d['Client Name'] = d.get('client_name')
                d['Name'] = d.get('client_name')
                d['Charge'] = d.get('charge_str')
                d['Status'] = d.get('status')
                d['Timestamp'] = d.get('timestamp_str')
                d['Record_ID'] = d.get('record_id')
                d['LLC'] = d.get('llc')
                d['Provider'] = d.get('provider')
                docs.append(d)
            return docs

        bill_data = clean_docs(billing_col.find().sort("created_at", -1).limit(1000))
        ins_data = clean_docs(insurance_col.find().sort("created_at", -1).limit(1000))
        design_data = clean_docs(design_col.find().sort("created_at", -1).limit(1000))
        ebook_data = clean_docs(ebook_col.find().sort("created_at", -1).limit(1000))
        
        stats_bill = calculate_mongo_stats(billing_col, 'billing')
        stats_ins = calculate_mongo_stats(insurance_col, 'insurance')
        stats_design = calculate_mongo_stats(design_col, 'design')
        stats_ebook = calculate_mongo_stats(ebook_col, 'ebook')
        
        p_bill = billing_col.count_documents({"status": "Pending"})
        p_ins = insurance_col.count_documents({"status": "Pending"})
        p_design = design_col.count_documents({"status": "Pending"})
        p_ebook = ebook_col.count_documents({"status": "Pending"})

        return {
            "billing": bill_data, 
            "insurance": ins_data,
            "design": design_data,
            "ebook": ebook_data,
            "stats_bill": {**stats_bill, "pending": p_bill}, 
            "stats_ins": {**stats_ins, "pending": p_ins},
            "stats_design": {**stats_design, "pending": p_design},
            "stats_ebook": {**stats_ebook, "pending": p_ebook}
        }
    except Exception as e:
        print(f"Manager Data Error: {e}")
        return JSONResponse({"status": "error", "message": "Data sync failed"}, 500)

@app.post("/api/manager/update_status")
async def update_status(type: str = Form(...), id: str = Form(...), status: str = Form(...)):
    try:
        if type == 'billing': col = billing_col
        elif type == 'insurance': col = insurance_col
        elif type == 'design': col = design_col
        elif type == 'ebook': col = ebook_col
        
        result = col.find_one_and_update(
            {"record_id": str(id)},
            {"$set": {"status": status}},
            return_document=True
        )
        if not result: raise Exception("ID not found in DB")
        
        pusher_client.trigger('techware-channel', 'status-update', {
            'id': id, 'status': status, 'type': type,
            'agent': result.get('agent'), 'client': result.get('client_name')
        })
        return {"status": "success", "message": "Updated in Database"}
    except Exception as e:
        return {"status": "error", "message": str(e)}




