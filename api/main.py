import os
import json
import gspread
import pandas as pd
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

load_dotenv()

app = FastAPI()

# --- SECURITY: LOAD SECRETS FROM ENV ---
PUSHER_APP_ID = os.getenv("PUSHER_APP_ID")
PUSHER_KEY = os.getenv("PUSHER_KEY")
PUSHER_SECRET = os.getenv("PUSHER_SECRET")
PUSHER_CLUSTER = os.getenv("PUSHER_CLUSTER")

pusher_client = pusher.Pusher(
  app_id=PUSHER_APP_ID,
  key=PUSHER_KEY,
  secret=PUSHER_SECRET,
  cluster=PUSHER_CLUSTER,
  ssl=True
)

# --- CACHE SETUP ---
# Stores stats for 60 seconds to save Google Quota
STATS_CACHE = {
    "last_updated": 0,
    "data": {
        "billing": {"total": 0, "breakdown": {}}, 
        "insurance": {"total": 0, "breakdown": {}}
    }
}
CACHE_DURATION = 60 

# --- SETUP ---
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
def get_gc():
    global gc
    try:
        service_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE")
        service_json = os.getenv("GCP_SERVICE_ACCOUNT") 
        if service_file and os.path.exists(service_file):
            gc = gspread.service_account(filename=service_file)
        elif service_json:
            gc = gspread.service_account_from_dict(json.loads(service_json))
        else:
            print("WARNING: No Credentials found.")
    except Exception as e:
        print(f"Error loading credentials: {e}")
    return gc

get_gc() # Init
SHEET_NAME = "Company_Transactions"

def get_worksheet(sheet_type):
    if not gc: get_gc()
    if not gc: return None
    try:
        sh = gc.open(SHEET_NAME)
        if sheet_type == 'billing': return sh.get_worksheet(0)
        if sheet_type == 'insurance': return sh.get_worksheet(1)
        if sheet_type == 'auth': return sh.get_worksheet(2)
    except Exception as e:
        print(f"Sheet Error: {e}")
        return None
    return None

# --- CONSTANTS ---
AGENTS_BILLING = ["Arham Kaleem", "Arham Ali", "Haziq", "Anus"]
AGENTS_INSURANCE = ["Saad"]
PROVIDERS = ["Spectrum", "Insurance", "Xfinity", "Frontier", "Optimum"]
LLC_SPEC = ["Visionary Pathways"]
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
    return now.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d %H:%M:%S")

def rows_to_dict(rows):
    if not rows or len(rows) < 2: return []
    headers = [str(h).strip() for h in rows[0]]
    data = []
    for row in rows[1:]:
        if len(row) < len(headers):
            row += [''] * (len(headers) - len(row))
        data.append(dict(zip(headers, row)))
    return data

def find_column(df, candidates):
    cols = {c.lower().strip(): c for c in df.columns}
    for cand in candidates:
        key = cand.lower().strip()
        if key in cols: return cols[key]
    return None

def calculate_stats(df):
    if df.empty: return {"today": 0, "night": 0, "pending": 0, "breakdown": {}}
    
    col_charge = find_column(df, ['Charge', 'Charge Amount', 'Amount'])
    col_status = find_column(df, ['Status', 'State'])
    col_time = find_column(df, ['Timestamp', 'Date', 'Time'])
    col_agent = find_column(df, ['Agent Name', 'Agent'])

    if col_charge:
        df['ChargeFloat'] = df[col_charge].astype(str).replace(r'[^0-9.]', '', regex=True)
        df['ChargeFloat'] = pd.to_numeric(df['ChargeFloat'], errors='coerce').fillna(0.0)
    else:
        df['ChargeFloat'] = 0.0

    if col_time:
        df['dt'] = pd.to_datetime(df[col_time], format='mixed', errors='coerce')
    else:
        df['dt'] = pd.NaT

    pending = 0
    if col_status:
        df['StatusClean'] = df[col_status].astype(str).str.strip().str.title()
        pending = len(df[df['StatusClean'] == 'Pending'])
    else:
        df['StatusClean'] = "Unknown"

    now = datetime.now(TZ_KARACHI)
    today = now.date()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)
    
    night_start = time(19, 0)
    night_end = time(6, 0)
    reset_time = time(9, 0)
    
    window_start = None
    window_end = None

    if now.time() >= night_start:
        window_start = datetime.combine(today, night_start)
        window_end = datetime.combine(tomorrow, night_end)
    elif now.time() < night_end:
        window_start = datetime.combine(yesterday, night_start)
        window_end = datetime.combine(today, night_end)
    else:
        if now.time() < reset_time:
            window_start = datetime.combine(yesterday, night_start)
            window_end = datetime.combine(today, night_end)
        else:
            window_start = None

    night_total = 0.0
    breakdown = {}

    if window_start and col_status and col_time:
        night_mask = ((df['StatusClean'] == "Charged") & (df['dt'] >= window_start) & (df['dt'] <= window_end))
        night_df = df.loc[night_mask]
        night_total = night_df['ChargeFloat'].sum()
        if col_agent: breakdown = night_df.groupby(col_agent)['ChargeFloat'].sum().to_dict()

    today_total = 0.0
    if col_status and col_time:
        today_start = datetime.combine(today, time(0,0))
        today_mask = (df['StatusClean'] == "Charged") & (df['dt'] >= today_start)
        today_total = df.loc[today_mask, 'ChargeFloat'].sum()

    return { "today": round(today_total, 2), "night": round(night_total, 2), "pending": pending, "breakdown": breakdown }

# --- ROUTES ---

@app.get("/", response_class=HTMLResponse)
async def index(request: Request): return templates.TemplateResponse("index.html", {"request": request})

@app.get("/billing", response_class=HTMLResponse)
async def view_billing(request: Request):
    return templates.TemplateResponse("billing.html", {"request": request, "agents": AGENTS_BILLING, "providers": PROVIDERS, "llcs": LLC_SPEC})

@app.get("/insurance", response_class=HTMLResponse)
async def view_insurance(request: Request):
    return templates.TemplateResponse("insurance.html", {"request": request, "agents": AGENTS_INSURANCE, "llcs": LLC_INS})

@app.get("/manager", response_class=HTMLResponse)
async def view_manager(request: Request):
    # Pass Pusher Public Key to Frontend securely
    return templates.TemplateResponse("manager.html", {
        "request": request, 
        "pusher_key": PUSHER_KEY, 
        "pusher_cluster": PUSHER_CLUSTER
    })

@app.get("/api/public/night-stats")
async def get_public_stats():
    current_time = time_module.time()
    if current_time - STATS_CACHE["last_updated"] < CACHE_DURATION:
        return STATS_CACHE["data"]

    try:
        ws_bill = get_worksheet('billing')
        ws_ins = get_worksheet('insurance')
        if not ws_bill or not ws_ins: return STATS_CACHE["data"]

        bill_data = rows_to_dict(ws_bill.get_all_values())
        ins_data = rows_to_dict(ws_ins.get_all_values())
        stats_bill = calculate_stats(pd.DataFrame(bill_data))
        stats_ins = calculate_stats(pd.DataFrame(ins_data))
        
        new_data = {
            "billing": { "total": stats_bill['night'], "breakdown": stats_bill['breakdown'] },
            "insurance": { "total": stats_ins['night'], "breakdown": stats_ins['breakdown'] }
        }
        STATS_CACHE["data"] = new_data
        STATS_CACHE["last_updated"] = current_time
        return new_data
    except Exception as e:
        print(f"Stats Error: {e}")
        return STATS_CACHE["data"]

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
    order_id: Optional[str] = Form(None),
    provider: Optional[str] = Form(None),
    pin_code: Optional[str] = Form(""),
    account_number: Optional[str] = Form(""),  
    record_id: Optional[str] = Form(None),
    timestamp_mode: Optional[str] = Form("keep"),
    original_timestamp: Optional[str] = Form(None),
    row_index: Optional[int] = Form(None)
):
    ws = get_worksheet(type)
    if not ws: return JSONResponse({"status": "error", "message": "DB Connection Failed"}, 500)

    if is_edit == 'true' and timestamp_mode == 'keep' and original_timestamp:
        try: date_str = original_timestamp.split(" ")[0]
        except: d, t = get_timestamp(); date_str = d
        timestamp_str = original_timestamp
    else:
        date_str, timestamp_str = get_timestamp()

    primary_id = order_id if type == 'billing' else record_id
    final_status = status if is_edit == 'true' else "Pending"
    final_code = pin_code if pin_code else account_number if account_number else ""

    if type == 'billing':
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), charge_amt, llc, provider, date_str, final_status, timestamp_str, final_code]
        range_end = f"Q{row_index}"
    else:
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), charge_amt, llc, date_str, final_status, timestamp_str]
        range_end = f"O{row_index}"

    try:
        if is_edit == 'true' and row_index:
            range_start = f"A{row_index}"
            ws.update(f"{range_start}:{range_end}", [row_data])
            STATS_CACHE["last_updated"] = 0
            return {"status": "success", "message": "Lead Updated Successfully"}
        else:
            ws.append_row(row_data)
            STATS_CACHE["last_updated"] = 0
            
            try:
                pusher_client.trigger('techware-channel', 'new-lead', {
                    'agent': agent,
                    'amount': charge_amt,
                    'type': type,
                    'message': f"New {type} lead from {agent}"
                })
            except Exception as e: print(f"Pusher Error: {e}")

            send_pushbullet(f"New {type.title()} Lead", f"{agent} - ${charge_amt}")
            return {"status": "success", "message": "Lead Submitted Successfully"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/delete-lead")
async def delete_lead(type: str = Form(...), id: str = Form(...)):
    ws = get_worksheet(type)
    if not ws: return JSONResponse({"status": "error", "message": "DB Error"}, 500)
    try:
        cell = ws.find(id, in_column=1)
        if cell:
            ws.delete_rows(cell.row)
            STATS_CACHE["last_updated"] = 0
            return {"status": "success", "message": "Deleted successfully"}
        return {"status": "error", "message": "ID not found"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/get-lead")
async def get_lead(type: str, id: str, row_index: Optional[int] = None):
    ws = get_worksheet(type)
    if not ws: return JSONResponse({"status": "error"}, 500)
    try:
        if row_index:
            row_values = ws.row_values(row_index)
            headers = ws.row_values(1)
            data = dict(zip(headers, row_values))
            data['row_index'] = row_index
            return {"status": "success", "data": data}
        
        try: cells = ws.findall(id, in_column=1)
        except gspread.exceptions.CellNotFound: return JSONResponse({"status": "error", "message": "Not Found"}, 404)

        if not cells: return JSONResponse({"status": "error", "message": "Not Found"}, 404)
        if len(cells) == 1:
            row_values = ws.row_values(cells[0].row)
            headers = ws.row_values(1)
            data = dict(zip(headers, row_values))
            data['row_index'] = cells[0].row
            return {"status": "success", "data": data}
        else:
            candidates = []
            headers = ws.row_values(1)
            for cell in cells:
                r_vals = ws.row_values(cell.row)
                d = dict(zip(headers, r_vals))
                candidates.append({"row_index": cell.row, "Client Name": d.get('Client Name', d.get('Name', 'Unknown')), "Timestamp": d.get('Timestamp', 'Unknown')})
            return {"status": "multiple", "candidates": candidates}
    except Exception as e: return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/manager/login")
async def manager_login(user_id: str = Form(...), password: str = Form(...)):
    ws = get_worksheet('auth')
    if not ws: return JSONResponse({"status": "error", "message": "Auth DB Error"}, 500)
    records = ws.get_all_records()
    df = pd.DataFrame(records)
    if 'ID' not in df.columns: return JSONResponse({"status": "error", "message": "Config Error"}, 500)
    user = df[df['ID'].astype(str) == user_id]
    if user.empty: return JSONResponse({"status": "error", "message": "User not found"}, 401)
    stored = str(user.iloc[0]['Password'])
    hashed = hashlib.sha256(password.encode()).hexdigest()
    if password == stored or hashed == stored:
        return {"status": "success", "token": f"auth_{user_id}", "role": "Manager"}
    return JSONResponse({"status": "error", "message": "Invalid password"}, 401)

@app.get("/api/manager/data")
async def get_manager_data(token: str):
    ws_bill = get_worksheet('billing')
    ws_ins = get_worksheet('insurance')
    bill_data = rows_to_dict(ws_bill.get_all_values()) if ws_bill else []
    ins_data = rows_to_dict(ws_ins.get_all_values()) if ws_ins else []
    stats_bill = calculate_stats(pd.DataFrame(bill_data))
    stats_ins = calculate_stats(pd.DataFrame(ins_data))
    return {"billing": bill_data, "insurance": ins_data, "stats_bill": stats_bill, "stats_ins": stats_ins}

@app.post("/api/manager/update_status")
async def update_status(type: str = Form(...), id: str = Form(...), status: str = Form(...)):
    ws = get_worksheet(type)
    if not ws: return JSONResponse({"status": "error"}, 500)
    try:
        cell = ws.find(id, in_column=1)
        if cell:
            headers = ws.row_values(1)
            try:
                status_col_index = headers.index("Status") + 1
                ws.update_cell(cell.row, status_col_index, status)
                
                # --- ADDED: Clear Cache ---
                STATS_CACHE["last_updated"] = 0
                
                # --- ADDED: Trigger Pusher ---
                try:
                    pusher_client.trigger('techware-channel', 'status-update', {
                        'id': id,
                        'status': status,
                        'type': type
                    })
                except Exception as e: print(f"Pusher Error: {e}")

                return {"status": "success"}
            except ValueError:
                return {"status": "error", "message": "Status column missing"}
        return {"status": "error", "message": "ID not found"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
