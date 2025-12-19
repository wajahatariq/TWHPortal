import os
import json
import gspread
import pandas as pd
import pytz
import requests
import hashlib
from datetime import datetime, timedelta, time
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# --- SETUP ---
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")
TZ_KARACHI = pytz.timezone("Asia/Karachi")

# --- SHEETS SETUP ---
gc = None
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

SHEET_NAME = "Company_Transactions"

def get_worksheet(sheet_type):
    if not gc: return None
    try:
        sh = gc.open(SHEET_NAME)
        if sheet_type == 'billing' or sheet_type == 'spectrum': return sh.get_worksheet(0)
        if sheet_type == 'insurance': return sh.get_worksheet(1)
        if sheet_type == 'auth': return sh.get_worksheet(2)
    except: return None
    return None

# --- CONSTANTS ---
AGENTS_BILLING = ["Arham Kaleem", "Arham Ali", "Haziq"]
AGENTS_INSURANCE = ["Select Agent", "Arham Kaleem", "Arham Ali", "Haziq", "Usama", "Areeb"]
PROVIDERS = ["Spectrum", "Insurance", "Xfinity", "Frontier", "Optimum"]
LLC_SPEC = ["Bite Bazaar LLC", "Apex Prime Solutions"]
LLC_INS = ["Select LLC", "LMI"]

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

def calculate_stats(df):
    if df.empty: return {"today": 0, "night": 0, "pending": 0}
    
    col_charge = 'Charge' if 'Charge' in df.columns else 'Charge Amount'
    if col_charge not in df.columns: df['ChargeFloat'] = 0.0
    else:
        df['ChargeFloat'] = df[col_charge].astype(str).str.replace('$', '').str.replace(',', '')
        df['ChargeFloat'] = pd.to_numeric(df['ChargeFloat'], errors='coerce').fillna(0.0)

    # --- FIX: Date Warning Fixed Here using format='mixed' ---
    df['dt'] = pd.to_datetime(df['Timestamp'], format='mixed', errors='coerce')

    pending = len(df[df['Status'].astype(str).str.strip().str.lower() == 'submitted'])

    now = datetime.now(TZ_KARACHI)
    if now.time() < time(20, 0): start_window = (now - timedelta(days=1)).replace(hour=20, minute=0, second=0)
    else: start_window = now.replace(hour=20, minute=0, second=0)
    end_window = start_window + timedelta(hours=12)

    # Use naive comparison by stripping timezone info if present
    night_mask = (df['Status'] == "Charged") & (df['dt'].dt.tz_localize(None) >= start_window.replace(tzinfo=None)) & (df['dt'].dt.tz_localize(None) <= end_window.replace(tzinfo=None))
    today_mask = (df['Status'] == "Charged") & (df['dt'].dt.tz_localize(None) >= now.replace(hour=0, minute=0, second=0).replace(tzinfo=None))

    return {
        "today": round(df.loc[today_mask, 'ChargeFloat'].sum(), 2),
        "night": round(df.loc[night_mask, 'ChargeFloat'].sum(), 2),
        "pending": pending
    }

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
    return templates.TemplateResponse("manager.html", {"request": request})

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
    status: Optional[str] = Form("Submitted"),
    order_id: Optional[str] = Form(None),
    provider: Optional[str] = Form(None),
    pin_code: Optional[str] = Form(""),
    record_id: Optional[str] = Form(None)
):
    ws = get_worksheet(type)
    if not ws: return JSONResponse({"status": "error", "message": "DB Connection Failed"}, 500)

    date_str, timestamp_str = get_timestamp()
    primary_id = order_id if type == 'billing' else record_id
    
    if type == 'billing':
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, card_number, exp_date, cvc, charge_amt, llc, provider, date_str, status, timestamp_str, pin_code]
    else:
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, card_number, exp_date, cvc, charge_amt, llc, date_str, status, timestamp_str]

    try:
        if is_edit == 'true':
            cell = ws.find(primary_id, in_column=1)
            if cell:
                range_start = f"A{cell.row}"
                range_end = f"Q{cell.row}" if type == 'billing' else f"O{cell.row}"
                ws.update(f"{range_start}:{range_end}", [row_data])
                return {"status": "success", "message": "Lead Updated Successfully"}
            else:
                return JSONResponse({"status": "error", "message": "ID not found for update"}, 404)
        else:
            records = ws.get_all_records()
            df = pd.DataFrame(records)
            col_name = 'Record_ID' if 'Record_ID' in df.columns else 'Order ID'
            
            if not df.empty and col_name in df.columns:
                if str(primary_id) in df[col_name].astype(str).values:
                    return JSONResponse({"status": "error", "message": f"ID {primary_id} already exists!"})
            
            ws.append_row(row_data)
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
            return {"status": "success", "message": "Deleted successfully"}
        return {"status": "error", "message": "ID not found"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/get-lead")
async def get_lead(type: str, id: str):
    ws = get_worksheet(type)
    if not ws: return JSONResponse({"status": "error"}, 500)
    try:
        cell = ws.find(id, in_column=1)
        if not cell: return JSONResponse({"status": "error", "message": "Not Found"}, 404)
        row_values = ws.row_values(cell.row)
        headers = ws.row_values(1)
        data = dict(zip(headers, row_values))
        return {"status": "success", "data": data}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/manager/login")
async def manager_login(user_id: str = Form(...), password: str = Form(...)):
    ws = get_worksheet('auth')
    if not ws: return JSONResponse({"status": "error", "message": "Auth DB Error"}, 500)
    records = ws.get_all_records()
    df = pd.DataFrame(records)
    df.columns = df.columns.str.strip()
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
    bill_data = ws_bill.get_all_records() if ws_bill else []
    ins_data = ws_ins.get_all_records() if ws_ins else []
    
    # CALCULATE SEPARATE STATS
    stats_bill = calculate_stats(pd.DataFrame(bill_data))
    stats_ins = calculate_stats(pd.DataFrame(ins_data))
    
    return {
        "billing": bill_data,
        "insurance": ins_data,
        "stats_bill": stats_bill,
        "stats_ins": stats_ins
    }

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
                return {"status": "success"}
            except ValueError:
                return {"status": "error", "message": "Status column missing"}
        return {"status": "error", "message": "ID not found"}
    except Exception as e:
        return {"status": "error", "message": str(e)}