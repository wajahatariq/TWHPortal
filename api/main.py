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

# --- CHAT SETUP ---
CHAT_HISTORY = []
CHAT_RATE_LIMIT = {"start": 0, "count": 0}

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
        else:
            print("WARNING: No Credentials found.")
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
        # --- NEW SHEETS ---
        if sheet_type == 'telecom_cb': return sh.worksheet("TELECOM CB") # Ensure tab is named exactly this
        if sheet_type == 'insurance_cb': return sh.worksheet("INSURANCE CB") # Ensure tab is named exactly this
    except Exception as e:
        print(f"Sheet Access Error (forcing reconnect): {e}")
        gc = None 
        return None
    return None

# --- CONSTANTS ---
AGENTS_BILLING = ["Arham Kaleem", "Arham Ali", "Haziq", "Anus", "Hasnain"]
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
    if df.empty: 
        return {
            "today": 0, "night": 0, "pending": 0, 
            "declined_amt": 0, "cb_amt": 0, "pending_amt": 0,
            "breakdown": {}
        }
    
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

    # --- UPDATED STATS CALCULATION ---
    if col_status:
        df['StatusClean'] = df[col_status].astype(str).str.strip().str.title()
        pending_count = len(df[df['StatusClean'] == 'Pending'])
        
        # Calculate Amounts for different statuses
        pending_amt = df.loc[df['StatusClean'] == 'Pending', 'ChargeFloat'].sum()
        declined_amt = df.loc[df['StatusClean'] == 'Declined', 'ChargeFloat'].sum()
        cb_amt = df.loc[df['StatusClean'].str.contains('Chargeback', case=False), 'ChargeFloat'].sum()
    else:
        df['StatusClean'] = "Unknown"
        pending_count = 0
        pending_amt = 0
        declined_amt = 0
        cb_amt = 0

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

    return { 
        "today": round(today_total, 2), 
        "night": round(night_total, 2), 
        "pending": pending_count, 
        "pending_amt": round(pending_amt, 2),
        "declined_amt": round(declined_amt, 2),
        "cb_amt": round(cb_amt, 2),
        "breakdown": breakdown 
    }

def safe_db_op(operation_func, retries=3):
    global gc
    last_error = None
    for i in range(retries):
        try:
            return operation_func()
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            if "connection aborted" in err_str or "remote end closed" in err_str or "429" in err_str:
                print(f"DB Connection dropped. Retrying ({i+1}/{retries})...")
                gc = None 
                time_module.sleep(1) 
            else:
                raise e 
    raise last_error

# --- ROUTES ---

@app.get("/", response_class=HTMLResponse)
async def index(request: Request): return templates.TemplateResponse("index.html", {"request": request})

@app.get("/billing", response_class=HTMLResponse)
async def view_billing(request: Request):
    return templates.TemplateResponse("billing.html", {
        "request": request, "agents": AGENTS_BILLING, "providers": PROVIDERS, "llcs": LLC_SPEC,
        "pusher_key": PUSHER_KEY, "pusher_cluster": PUSHER_CLUSTER
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
    # NO CACHE - FETCH FRESH
    def fetch_op():
        ws_bill = get_worksheet('billing')
        ws_ins = get_worksheet('insurance')
        if not ws_bill or not ws_ins: return {}

        bill_data = rows_to_dict(ws_bill.get_all_values())
        ins_data = rows_to_dict(ws_ins.get_all_values())
        stats_bill = calculate_stats(pd.DataFrame(bill_data))
        stats_ins = calculate_stats(pd.DataFrame(ins_data))
        
        return {
            "billing": { "total": stats_bill['night'], "breakdown": stats_bill['breakdown'] },
            "insurance": { "total": stats_ins['night'], "breakdown": stats_ins['breakdown'] }
        }

    try:
        return safe_db_op(fetch_op)
    except Exception as e:
        print(f"Stats Error: {e}")
        return {}

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
        return JSONResponse({"status": "error", "message": "Global chat limit reached (30/hr)."}, 429)

    CHAT_RATE_LIMIT["count"] += 1
    t_str = datetime.now(TZ_KARACHI).strftime("%I:%M %p")
    msg_data = {"sender": sender, "message": message, "role": role, "time": t_str}
    CHAT_HISTORY.append(msg_data)
    if len(CHAT_HISTORY) > 50: CHAT_HISTORY.pop(0)

    try: pusher_client.trigger('techware-channel', 'new-chat', msg_data)
    except Exception as e: print(f"Pusher Chat Error: {e}")
    return {"status": "success"}

@app.post("/api/save-lead")
async def save_lead(
    request: Request, type: str = Form(...), is_edit: str = Form("false"),
    agent: str = Form(...), client_name: str = Form(...), phone: str = Form(...),
    address: str = Form(...), email: str = Form(...), card_holder: str = Form(...),
    card_number: str = Form(...), exp_date: str = Form(...), cvc: str = Form(...),
    charge_amt: str = Form(...), llc: str = Form(...), status: Optional[str] = Form("Pending"),
    order_id: Optional[str] = Form(None), provider: Optional[str] = Form(None),
    pin_code: Optional[str] = Form(""), account_number: Optional[str] = Form(""),  
    record_id: Optional[str] = Form(None), timestamp_mode: Optional[str] = Form("keep"),
    original_timestamp: Optional[str] = Form(None), row_index: Optional[int] = Form(None)
):
    try:
        clean_charge = float(str(charge_amt).replace('$', '').replace(',', '').strip())
        final_charge = f"${clean_charge:.2f}"
    except: final_charge = charge_amt 

    if is_edit == 'true' and timestamp_mode == 'keep' and original_timestamp:
        try: date_str = original_timestamp.split(" ")[0]
        except: d, t = get_timestamp(); date_str = d
        timestamp_str = original_timestamp
    else:
        date_str, timestamp_str = get_timestamp()

    raw_id = order_id if type == 'billing' else record_id
    primary_id = int(raw_id) if raw_id and str(raw_id).isdigit() else raw_id
    final_status = status if is_edit == 'true' else "Pending"
    final_code = pin_code if pin_code else account_number if account_number else ""

    if type == 'billing':
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge, llc, provider, date_str, final_status, timestamp_str, final_code]
        range_end = f"Q{row_index}"
    else:
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge, llc, date_str, final_status, timestamp_str]
        range_end = f"O{row_index}"

    def db_save_op():
        ws = get_worksheet(type)
        if not ws: raise Exception("DB Connection Failed")
        if is_edit == 'true' and row_index:
            range_start = f"A{row_index}"
            ws.update(f"{range_start}:{range_end}", [row_data])
        else:
            ws.append_row(row_data)

    try:
        safe_db_op(db_save_op)
        if is_edit == 'true':
            try:
                pusher_client.trigger('techware-channel', 'lead-edited', {
                    'agent': agent, 'id': primary_id, 'type': type, 'client': client_name,
                    'message': f"{type.title()} Lead #{primary_id} was edited by {agent}"
                })
            except Exception as e: print(f"Pusher Edit Error: {e}")
            return {"status": "success", "message": "Lead Updated Successfully"}
        else:
            try:
                pusher_client.trigger('techware-channel', 'new-lead', {
                    'agent': agent, 'amount': final_charge, 'type': type,
                    'message': f"New {type} lead from {agent}"
                })
            except Exception as e: print(f"Pusher Error: {e}")
            send_pushbullet(f"New {type.title()} Lead", f"{agent} - {final_charge}")
            return {"status": "success", "message": "Lead Submitted Successfully"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/delete-lead")
async def delete_lead(type: str = Form(...), id: str = Form(...)):
    def delete_op():
        ws = get_worksheet(type)
        if not ws: raise Exception("DB Error")
        cell = ws.find(id, in_column=1)
        if cell:
            ws.delete_rows(cell.row)
            return True
        return False
    try:
        found = safe_db_op(delete_op)
        if found: return {"status": "success", "message": "Deleted successfully"}
        return {"status": "error", "message": "ID not found"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/api/get-lead")
async def get_lead(type: str, id: str, row_index: Optional[int] = None):
    def fetch_lead_op():
        ws = get_worksheet(type)
        if not ws: raise Exception("DB Error")
        if row_index:
            row_values = ws.row_values(row_index)
            headers = ws.row_values(1)
            data = dict(zip(headers, row_values))
            data['row_index'] = row_index
            if 'Record_ID' not in data and 'Order ID' in data: data['Record_ID'] = data['Order ID']
            return {"status": "success", "data": data}
        cells = []
        try: cells = ws.findall(id, in_column=1)
        except: pass
        if not cells and str(id).strip().isdigit():
            try: cells = ws.findall(int(id), in_column=1)
            except: pass
        if not cells: return None
        if len(cells) == 1:
            row_values = ws.row_values(cells[0].row)
            headers = ws.row_values(1)
            data = dict(zip(headers, row_values))
            data['row_index'] = cells[0].row
            if 'Record_ID' not in data and 'Order ID' in data: data['Record_ID'] = data['Order ID']
            return {"status": "success", "data": data}
        else:
            candidates = []
            headers = ws.row_values(1)
            for cell in cells:
                r_vals = ws.row_values(cell.row)
                d = dict(zip(headers, r_vals))
                candidates.append({
                    "row_index": cell.row, 
                    "name": d.get('Client Name', d.get('Name', 'Unknown')), 
                    "charge": d.get('Charge', d.get('Charge Amount', '$0')), 
                    "timestamp": d.get('Timestamp', 'No Time')
                })
            candidates.sort(key=lambda x: x['row_index'], reverse=True)
            return {"status": "multiple", "candidates": candidates}

    try:
        result = safe_db_op(fetch_lead_op)
        if result is None: return JSONResponse({"status": "error", "message": "Not Found"}, 404)
        return result
    except Exception as e: return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/manager/login")
async def manager_login(user_id: str = Form(...), password: str = Form(...)):
    def login_op():
        ws = get_worksheet('auth')
        if not ws: raise Exception("Auth DB Error")
        records = ws.get_all_records()
        return pd.DataFrame(records)
    try:
        df = safe_db_op(login_op)
        if 'ID' not in df.columns: return JSONResponse({"status": "error", "message": "Config Error"}, 500)
        user = df[df['ID'].astype(str) == user_id]
        if user.empty: return JSONResponse({"status": "error", "message": "User not found"}, 401)
        stored = str(user.iloc[0]['Password'])
        hashed = hashlib.sha256(password.encode()).hexdigest()
        if password == stored or hashed == stored:
            return {"status": "success", "token": f"auth_{user_id}", "role": "Manager"}
        return JSONResponse({"status": "error", "message": "Invalid password"}, 401)
    except Exception as e: return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/manager/change_password")
async def change_password(user_id: str = Form(...), old_password: str = Form(...), new_password: str = Form(...)):
    def pw_op():
        ws = get_worksheet('auth')
        if not ws: raise Exception("Auth DB Error")
        
        # Find User
        try: cell = ws.find(user_id, in_column=1)
        except: cell = None
        
        if not cell: return "User Not Found"
        
        # Verify Old Password (Column 2)
        stored_pw = str(ws.cell(cell.row, 2).value)
        hashed_old = hashlib.sha256(old_password.encode()).hexdigest()
        
        if old_password != stored_pw and hashed_old != stored_pw:
            return "Incorrect Old Password"
            
        # Update Password (Store Plaintext or Hash?) 
        # Keeping consistent with your login: storing plaintext for now based on your code, 
        # but normally we should hash.
        ws.update_cell(cell.row, 2, new_password)
        return "Success"

    try:
        res = safe_db_op(pw_op)
        if res == "Success": return {"status": "success", "message": "Password Changed"}
        return {"status": "error", "message": res}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/api/manager/data")
async def get_manager_data(token: str):
    # NO CACHE
    def fetch_manager_data():
        ws_bill = get_worksheet('billing')
        time_module.sleep(1) 
        ws_ins = get_worksheet('insurance')

        bill_data = rows_to_dict(ws_bill.get_all_values()) if ws_bill else []
        ins_data = rows_to_dict(ws_ins.get_all_values()) if ws_ins else []
        
        stats_bill = calculate_stats(pd.DataFrame(bill_data))
        stats_ins = calculate_stats(pd.DataFrame(ins_data))
        
        return {
            "billing": bill_data, "insurance": ins_data, 
            "stats_bill": stats_bill, "stats_ins": stats_ins
        }
    try:
        return safe_db_op(fetch_manager_data)
    except Exception as e:
        print(f"Manager Data Error: {e}")
        return JSONResponse({"status": "error", "message": "Data sync failed"}, 500)

@app.post("/api/manager/update_status")
async def update_status(type: str = Form(...), id: str = Form(...), status: str = Form(...)):
    def update_op():
        ws = get_worksheet(type)
        if not ws: raise Exception("DB Connection Failed")
        all_values = ws.get_all_values()
        if not all_values: raise Exception("Empty Sheet")
        
        headers = [str(h).strip().lower() for h in all_values[0]]
        status_col_idx = -1
        possible_status = ["status", "state", "approval", "current status"]
        for i, h in enumerate(headers):
            if h in possible_status:
                status_col_idx = i; break
        if status_col_idx == -1: status_col_idx = 14 if type == 'billing' else 13

        target_id = str(id).strip()
        candidates = []
        for row_num, row in enumerate(all_values):
            if row_num == 0: continue
            if len(row) > 0 and str(row[0]).strip() == target_id:
                curr_status = str(row[status_col_idx]).strip().title() if len(row) > status_col_idx else ""
                candidates.append({"row_index": row_num + 1, "status": curr_status, "data": row})

        if not candidates: raise Exception(f"ID '{id}' not found.")
        
        pending_matches = [c for c in candidates if c['status'] == 'Pending']
        target_match = max(pending_matches, key=lambda x: x['row_index']) if pending_matches else max(candidates, key=lambda x: x['row_index'])
        
        target_row = target_match['row_index']
        target_data = target_match['data']
        headers_map = dict(zip(all_values[0], target_data))
        agent_name = headers_map.get('Agent Name', 'Unknown Agent')
        client_name = headers_map.get('Client Name', headers_map.get('Name', 'Unknown Client'))

        ws.update_cell(target_row, status_col_idx + 1, status)
        return agent_name, client_name

    try:
        agent_name, client_name = safe_db_op(update_op)
        try:
            pusher_client.trigger('techware-channel', 'status-update', {
                'id': id, 'status': status, 'type': type, 'agent': agent_name, 'client': client_name
            })
        except Exception as e: print(f"Pusher Error: {e}")
        return {"status": "success", "message": "Updated"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.post("/api/manager/mark_chargeback")
async def mark_chargeback(type: str = Form(...), id: str = Form(...)):
    # LOGIC: Move from Main Sheet -> CB Sheet
    def move_op():
        src_ws = get_worksheet(type)
        if type == 'billing': dest_ws = get_worksheet('telecom_cb')
        else: dest_ws = get_worksheet('insurance_cb')
        
        if not src_ws or not dest_ws: raise Exception("Sheet Configuration Error")

        # Find the row
        try: cell = src_ws.find(id, in_column=1)
        except: cell = None
        
        if not cell: raise Exception("Lead ID not found in source sheet")
        
        # Get Data
        row_values = src_ws.row_values(cell.row)
        
        # 1. Append to Destination
        dest_ws.append_row(row_values)
        
        # 2. Update Status to 'Chargeback' in Destination (Optional, but good for clarity)
        # Assuming Status column is roughly same position
        # dest_ws.update_cell(dest_ws.row_count, STATUS_COL, "Chargeback") 
        
        # 3. Delete from Source
        src_ws.delete_rows(cell.row)
        
        return "Moved"

    try:
        safe_db_op(move_op)
        return {"status": "success", "message": "Moved to Chargeback Sheet"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
