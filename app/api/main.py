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

def rows_to_dict(rows):
    if not rows or len(rows) < 2: return []
    headers = [h.strip() for h in rows[0]]
    data = []
    for row in rows[1:]:
        if len(row) < len(headers):
            row += [''] * (len(headers) - len(row))
        data.append(dict(zip(headers, row)))
    return data

def calculate_stats(df):
    if df.empty: return {"today": 0, "night": 0, "pending": 0, "breakdown": {}}
    
    col_charge = 'Charge' if 'Charge' in df.columns else 'Charge Amount'
    if col_charge not in df.columns: 
        df['ChargeFloat'] = 0.0
    else:
        df['ChargeFloat'] = df[col_charge].astype(str).str.replace(r'[$,]', '', regex=True)
        df['ChargeFloat'] = pd.to_numeric(df['ChargeFloat'], errors='coerce').fillna(0.0)

    df['dt'] = pd.to_datetime(df['Timestamp'], format='mixed', errors='coerce')

    if 'Status' in df.columns:
        pending = len(df[df['Status'].astype(str).str.strip().str.title() == 'Pending'])
    else:
        pending = 0

    now = datetime.now(TZ_KARACHI)
    today = now.date()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)
    
    night_start = time(19, 0)
    night_end = time(6, 0)
    reset_time = time(9, 0)
    
    window_start = None
    window_end = None

    # Logic: 7 PM to 6 AM, visible until 9 AM
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

    if window_start:
        night_mask = (
            (df['Status'].astype(str).str.title() == "Charged") & 
            (df['dt'] >= window_start) & 
            (df['dt'] <= window_end)
        )
        night_df = df.loc[night_mask]
        night_total = night_df['ChargeFloat'].sum()
        
        # Breakdown by Agent
        if 'Agent Name' in night_df.columns:
            # Group by Agent and sum
            grouped = night_df.groupby('Agent Name')['ChargeFloat'].sum()
            breakdown = grouped.to_dict()

    today_start = datetime.combine(today, time(0,0))
    today_mask = (
        (df['Status'].astype(str).str.title() == "Charged") & 
        (df['dt'] >= today_start)
    )
    today_total = df.loc[today_mask, 'ChargeFloat'].sum()

    return {
        "today": round(today_total, 2),
        "night": round(night_total, 2),
        "pending": pending,
        "breakdown": breakdown
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

@app.get("/api/public/night-stats")
async def get_public_stats():
    try:
        ws_bill = get_worksheet('billing')
        ws_ins = get_worksheet('insurance')
        
        # Use get_all_values to be consistent
        bill_data = rows_to_dict(ws_bill.get_all_values()) if ws_bill else []
        ins_data = rows_to_dict(ws_ins.get_all_values()) if ws_ins else []
        
        stats_bill = calculate_stats(pd.DataFrame(bill_data))
        stats_ins = calculate_stats(pd.DataFrame(ins_data))
        
        return {
            "billing": { "total": stats_bill['night'], "breakdown": stats_bill['breakdown'] },
            "insurance": { "total": stats_ins['night'], "breakdown": stats_ins['breakdown'] }
        }
    except Exception as e:
        print(f"Stats Error: {e}")
        # Return structure compatible with frontend
        return {
            "billing": {"total": 0, "breakdown": {}}, 
            "insurance": {"total": 0, "breakdown": {}}
        }

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
    record_id: Optional[str] = Form(None),
    timestamp_mode: Optional[str] = Form("keep"),
    original_timestamp: Optional[str] = Form(None)
):
    ws = get_worksheet(type)
    if not ws: return JSONResponse({"status": "error", "message": "DB Connection Failed"}, 500)

    if is_edit == 'true' and timestamp_mode == 'keep' and original_timestamp:
        timestamp_str = original_timestamp
        try:
            date_str = timestamp_str.split(" ")[0]
        except:
            d, t = get_timestamp()
            date_str = d
    else:
        date_str, timestamp_str = get_timestamp()

    primary_id = order_id if type == 'billing' else record_id
    
    final_status = status 
    if is_edit == 'false':
        final_status = "Pending"

    if type == 'billing':
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), charge_amt, llc, provider, date_str, final_status, timestamp_str, pin_code]
    else:
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), charge_amt, llc, date_str, final_status, timestamp_str]

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
    
    raw_bill = ws_bill.get_all_values() if ws_bill else []
    raw_ins = ws_ins.get_all_values() if ws_ins else []
    
    data_bill = rows_to_dict(raw_bill)
    data_ins = rows_to_dict(raw_ins)
    
    stats_bill = calculate_stats(pd.DataFrame(data_bill))
    stats_ins = calculate_stats(pd.DataFrame(data_ins))
    
    return {
        "billing": data_bill,
        "insurance": data_ins,
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