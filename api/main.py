import os
import json
from typing import Optional
from fastapi import FastAPI, Request, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import pandas as pd
import pusher
from pushbullet import Pushbullet
from litellm import completion

# ==========================================
# CONFIGURATION & SETUP
# ==========================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. GOOGLE SHEETS SETUP ---
scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
try:
    creds = ServiceAccountCredentials.from_json_keyfile_name("api/credentials.json", scope)
    client = gspread.authorize(creds)
except:
    print("Warning: Google Sheets Credentials not found locally.")

SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE" # <--- ENSURE THIS IS CORRECT

# --- 2. PUSHER SETUP ---
pusher_client = pusher.Pusher(
    app_id=os.getenv("PUSHER_APP_ID", "YOUR_APP_ID"),
    key=os.getenv("PUSHER_KEY", "YOUR_KEY"),
    secret=os.getenv("PUSHER_SECRET", "YOUR_SECRET"),
    cluster=os.getenv("PUSHER_CLUSTER", "mt1"),
    ssl=True
)

# --- 3. PUSHBULLET SETUP ---
pb = None
PB_KEY = os.getenv("PUSHBULLET_KEY")
if PB_KEY:
    pb = Pushbullet(PB_KEY)

# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_worksheet(type_name):
    try:
        sh = client.open_by_key(SHEET_ID)
        if type_name == 'billing': return sh.worksheet("Billing")
        if type_name == 'insurance': return sh.worksheet("Insurance")
        return None
    except Exception as e:
        print(f"DB Error: {e}")
        return None

def get_timestamp():
    from datetime import datetime
    import pytz
    tz = pytz.timezone('Asia/Karachi')
    now = datetime.now(tz)
    return now.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d %H:%M:%S")

def send_pushbullet(title, body):
    if pb:
        try: pb.push_note(title, body)
        except: pass

# --- AI EMAIL GENERATOR ---
def generate_email_with_groq(lead_data):
    """
    Uses Groq (via LiteLLM) to generate a payment confirmation email.
    """
    name = lead_data.get('Client Name', lead_data.get('Name', 'Valued Customer'))
    provider = lead_data.get('Provider', 'Service Provider')
    
    # Handle charge formatting
    raw_charge = lead_data.get('Charge', lead_data.get('Charge Amount', '$0.00'))
    amount = raw_charge if '$' in str(raw_charge) else f"${raw_charge}"
    
    llc_name = lead_data.get('LLC', 'Visionary Pathways')
    
    prompt = f"""
    You are a professional Customer Support AI for {llc_name}.
    
    Write a payment confirmation email to a client with the following details:
    - Client Name: {name}
    - Service Provider: {provider}
    - Charged Amount: {amount}
    - Authorized Retailer: {llc_name}
    - Monthly Bill Next Month: Calculate approx $15 more than the charge amount.
    - Discount: $10.00 monthly discount for AutoPay.
    
    Strictly follow this structure:
    "Dear [Client Name],
    
    Thank you for choosing [Provider].
    
    We’re writing to confirm that a payment of [Amount] has been successfully charged to your account.
    
    Beginning next month, your monthly bill will be [Calculated Amount], which reflects a $10.00 monthly discount applied for setting up AutoPay through [LLC Name], an authorized [Provider] retailer.
    
    If you have any questions regarding your billing, AutoPay setup, or applied discount, our team is always here to assist you.
    
    Thank you for choosing [Provider]. We look forward to serving you.
    
    Warm regards,
    Customer Support Team
    [Provider]"
    
    Output ONLY the email body. Do not include subject lines.
    """

    try:
        response = completion(
            model="groq/llama3-8b-8192", 
            messages=[{"role": "user", "content": prompt}]
        )
        return response['choices'][0]['message']['content']
    except Exception as e:
        print(f"LLM Error: {e}")
        return None

# ==========================================
# ROUTES
# ==========================================

@app.get("/")
def home():
    return {"message": "TWH Portal API is Running"}

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

    try:
        clean_charge = float(str(charge_amt).replace('$', '').replace(',', '').strip())
        final_charge = f"${clean_charge:.2f}"
    except:
        final_charge = charge_amt 

    if is_edit == 'true' and timestamp_mode == 'keep' and original_timestamp:
        timestamp_str = original_timestamp
        try: date_str = original_timestamp.split(" ")[0]
        except: d, t = get_timestamp(); date_str = d
    else:
        date_str, timestamp_str = get_timestamp()

    # --- ID FIX ---
    raw_id = order_id if type == 'billing' else record_id
    if raw_id and str(raw_id).isdigit():
        primary_id = int(raw_id)
    else:
        primary_id = raw_id

    final_status = status if is_edit == 'true' else "Pending"
    final_code = pin_code if pin_code else account_number if account_number else ""

    if type == 'billing':
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge, llc, provider, date_str, final_status, timestamp_str, final_code]
        range_end = f"Q{row_index}"
    else:
        row_data = [primary_id, agent, client_name, phone, address, email, card_holder, str(card_number), str(exp_date), str(cvc), final_charge, llc, date_str, final_status, timestamp_str]
        range_end = f"O{row_index}"

    try:
        if is_edit == 'true' and row_index:
            range_start = f"A{row_index}"
            ws.update(f"{range_start}:{range_end}", [row_data])
            return {"status": "success", "message": "Lead Updated Successfully"}
        else:
            ws.append_row(row_data)
            
            # --- MANAGER NOTIFICATION (Standard) ---
            try:
                pusher_client.trigger('techware-channel', 'new-lead', {
                    'agent': agent,
                    'amount': final_charge,
                    'type': type,
                    'message': f"New {type} lead from {agent}"
                })
            except Exception as e: print(f"Pusher Error: {e}")

            send_pushbullet(f"New {type.title()} Lead", f"{agent} - {final_charge}")
            return {"status": "success", "message": "Lead Submitted Successfully"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)

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
            if 'Record_ID' not in data and 'Order ID' in data: data['Record_ID'] = data['Order ID']
            return {"status": "success", "data": data}
        
        cells = []
        try: cells = ws.findall(id, in_column=1)
        except: pass

        if not cells and str(id).strip().isdigit():
            try: cells = ws.findall(int(id), in_column=1)
            except: pass

        if not cells: return JSONResponse({"status": "error", "message": "Not Found"}, 404)
        
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
                    "timestamp": d.get('Timestamp', '')
                })
            candidates.sort(key=lambda x: x['row_index'], reverse=True)
            return {"status": "multiple", "candidates": candidates}

    except Exception as e: 
        return JSONResponse({"status": "error", "message": str(e)}, 500)

@app.post("/api/update-status")
async def update_status(
    type: str = Form(...),
    id: str = Form(...),
    status: str = Form(...),
    row_index: Optional[int] = Form(None)
):
    ws = get_worksheet(type)
    if not ws: return JSONResponse({"status": "error"}, 500)
    
    try:
        # 1. FIND ROW
        target_row = row_index
        if not target_row:
            cell = ws.find(id, in_column=1)
            if not cell and str(id).isdigit():
                cell = ws.find(int(id), in_column=1)
            if cell: target_row = cell.row
        
        if not target_row: return JSONResponse({"status": "error", "message": "ID Not Found"}, 404)

        # 2. UPDATE STATUS
        headers = ws.row_values(1)
        try: status_col = headers.index('Status') + 1
        except: status_col = 15 if type == 'billing' else 14
        
        ws.update_cell(target_row, status_col, status)

        # 3. IF CHARGED -> GENERATE EMAIL & NOTIFY AGENT
        generated_email = None
        if status == "Charged" and type == 'billing':
            # Get full data to find Agent Name and Generate Email
            row_values = ws.row_values(target_row)
            data = dict(zip(headers, row_values))
            
            agent_name = data.get('Agent Name', data.get('Agent', ''))
            generated_email = generate_email_with_groq(data)
            
            if generated_email:
                try:
                    # TRIGGER PUSHER EVENT FOR THE AGENT
                    pusher_client.trigger('techware-channel', 'payment-confirmed', {
                        'agent': agent_name,
                        'email_body': generated_email,
                        'client_name': data.get('Client Name', 'Client'),
                        'message': "Payment Approved! Email Generated."
                    })
                except Exception as e:
                    print(f"Pusher Notification Error: {e}")

        return {
            "status": "success", 
            "message": "Status Updated", 
            "generated_email": generated_email
        }

    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, 500)
