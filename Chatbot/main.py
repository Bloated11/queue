import os
import asyncio
import requests
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load env from backend
load_dotenv("../backend/.env")

# Constants
MAX_HISTORY = 4
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "tinyllama:latest"
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Variables
conversation_memory = {}
client = AsyncIOMotorClient(MONGO_URI)
db = client['test']

# Simple Keyword-based RAG Setup
KNOWLEDGE_FILE = "Knowledge.txt"
knowledge_chunks = []
if os.path.exists(KNOWLEDGE_FILE):
    with open(KNOWLEDGE_FILE, "r", encoding="utf-8") as f:
        knowledge_text = f.read()
    knowledge_chunks = [chunk.strip() for chunk in knowledge_text.split("\n\n") if chunk.strip()]
else:
    knowledge_chunks = ["No specific knowledge available."]

def retrieve_relevant_context(query: str, top_k: int = 1):
    """Simple keyword matching as a fallback for heavy embeddings"""
    q_words = [w for w in query.lower().split() if len(w) > 3]
    if not q_words:
        return knowledge_chunks[0] if knowledge_chunks else "No specific knowledge available."
    
    scored_chunks = []
    for chunk in knowledge_chunks:
        chunk_lower = chunk.lower()
        score = 0
        for word in q_words:
            # Full word match
            if word in chunk_lower:
                score += 3
            # Partial match (stemming-like)
            elif any(chunk_word.startswith(word[:4]) for chunk_word in chunk_lower.split() if len(chunk_word) > 3):
                score += 1
        
        # Bonus for exact phrase matches
        if query.lower() in chunk_lower:
            score += 5
        
        if score > 0:
            scored_chunks.append((score, chunk))
    
    # Sort by score
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    
    if not scored_chunks:
        return "Campus Queue is a digital system for managing department queues."
    
    # Just return the top chunk for conciseness
    return scored_chunks[0][1]

LIVE_DATA_KEYWORDS = [
    "my ticket", "my status", "my position", "my turn", "my queue", "my wait", "my place", "my number",
    "ticket status", "ticket position", "ticket turn", "ticket place", "ticket number", "check ticket",
    "join queue", "join a queue", "joining a queue", "joining queue"
]
DEPT_KEYWORDS = [
    "list departments", "show departments", "which departments", "available departments", "all departments",
    "department list", "which dept", "show depts", "list depts"
]

def get_query_category(question: str) -> str:
    q = question.lower().strip()
    if any(k in q for k in LIVE_DATA_KEYWORDS):
        return "TICKET"
    if any(k in q for k in DEPT_KEYWORDS):
        return "DEPARTMENTS"
    return "KNOWLEDGE"

async def fetch_department_info(query: str):
    """Try to find a specific department mentioned in the query and show its status"""
    try:
        # Search for all active departments
        depts = await db.departments.find({"isActive": True}).to_list(length=100)
        found_dept = None
        for d in depts:
            dept_name = d.get("name", "").lower()
            if dept_name and dept_name in query.lower():
                found_dept = d
                break
        
        if not found_dept:
            return None
            
        dept_id = found_dept.get("_id")
        queue = await db.queues.find_one({"department": dept_id})
        
        if not queue:
            return f"The {found_dept.get('name')} department is active, but its queue is not currently open."
            
        waiting_count = await db.tickets.count_documents({
            "queue": queue.get("_id"),
            "status": "waiting"
        })
        
        return f"The {found_dept.get('name')} department queue is currently open. There are {waiting_count} people waiting in line. You can join this queue from your dashboard."
    except Exception as e:
        print(f"Dept Info Error: {e}")
        return None

class ChatRequest(BaseModel):
    question: str
    userId: Optional[str] = "anonymous"
    role: Optional[str] = "guest"

async def fetch_live_data(user_id: str, role: str, query: str = ""):
    if not user_id or str(user_id).lower() in ["anonymous", "null", "none", "", "undefined"]:
        return "I'd love to help with your ticket, but I can't see your status until you're logged in! Please log in to your account first."

    # If asking about joining, first check if they HAVE one
    is_joining_query = any(k in query.lower() for k in ["join", "joining"])
    
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    try:
        search_criteria = {
            "status": {"$in": ["waiting", "serving", "called"]},
            "createdAt": {"$gte": today}
        }
        if role == "guest":
            search_criteria["guestToken"] = user_id
        else:
            from bson import ObjectId
            clean_id = str(user_id)
            if "ObjectId" in clean_id:
                import re
                match = re.search(r"[a-f0-9]{24}", clean_id)
                if match:
                    clean_id = match.group(0)
            
            try:
                search_criteria["user"] = ObjectId(clean_id)
            except:
                return "I'm having trouble identifying your account. Please try logging out and back in."

        ticket = await db.tickets.find_one(search_criteria)
        
        if ticket:
            # Get department name
            queue_id = ticket.get("queue")
            queue = await db.queues.find_one({"_id": queue_id})
            dept_name = "Department"
            if queue:
                dept = await db.departments.find_one({"_id": queue.get("department")})
                if dept:
                    dept_name = dept.get("name")
            return f"You already have an active ticket (#{ticket.get('ticketNumber')}) in the {dept_name} queue. Your current status is \"{ticket.get('status')}\"."

        if is_joining_query:
            return "To join a queue, go to your Student Dashboard, select an active department, and click 'Join Queue'. Let me know if you need a list of active departments!"

        return "You don't have any active tickets right now. Would you like to join a queue?"
    except Exception as e:
        print(f"DB Error in fetch_live_data: {e}")
        return "I encountered an error while checking the queue status."

async def fetch_department_list():
    try:
        depts = await db.departments.find({"isActive": True}).to_list(length=20)
        if not depts:
            return "No departments are currently active."
        names = [d.get("name") for d in depts]
        return f"Active departments are: {', '.join(names)}."
    except:
        return "Department list is unavailable."

@app.post("/chat")
async def chat_with_memory(data: ChatRequest):
    user_key = data.userId or "anonymous"
    q = data.question.lower().strip()

    if user_key not in conversation_memory:
        conversation_memory[user_key] = [
            {"role": "system", "content": "You are the Campus Assistant AI. Help users with the queue system. Keep answers very short and friendly. Use the provided context."}
        ]

    # Hybrid logic: Direct DB access for specific keywords, AI for the rest
    category = get_query_category(q)
    
    # 1. Handle Greetings and Identity directly
    if any(k in q for k in ["who are you", "what are you", "your name"]):
        assistant_reply = "I am the Campus Assistant AI, here to help you navigate the Campus Queue system. I can check your ticket status, list departments, and answer questions about how the system works."
    elif any(k in q for k in ["hi", "hello", "hey", "greetings"]):
        assistant_reply = "Hello! I'm your Campus Assistant. How can I help you with your queue or department queries today?"
    
    # 2. Handle specific DB queries (TICKET, DEPARTMENTS, or specific DEPT NAME)
    elif category == "TICKET":
        assistant_reply = await fetch_live_data(data.userId, data.role, q)
    elif category == "DEPARTMENTS":
        assistant_reply = await fetch_department_list()
    else:
        # Check if they're asking about a specific department
        dept_info = await fetch_department_info(data.question)
        if dept_info:
            assistant_reply = dept_info
        else:
            # 3. Handle General Knowledge with RAG + LLM
            context = retrieve_relevant_context(data.question)
            messages = conversation_memory[user_key].copy()
            messages.append({"role": "system", "content": f"Context: {context}"})
            messages.append({"role": "user", "content": data.question})

            assistant_reply = ""
            try:
                response = requests.post(
                    OLLAMA_URL,
                    json={
                        "model": MODEL_NAME,
                        "messages": messages,
                        "stream": False,
                        "options": {"num_predict": 120, "temperature": 0.5}
                    },
                    timeout=10
                )
                if response.status_code == 200:
                    assistant_reply = response.json()["message"]["content"]
            except:
                pass

            if not assistant_reply:
                assistant_reply = context if len(context) > 20 else "I'm here to help with Campus Queue! What's on your mind?"

    # Update memory and return
    conversation_memory[user_key].append({"role": "user", "content": data.question})
    conversation_memory[user_key].append({"role": "assistant", "content": assistant_reply})
    
    if len(conversation_memory[user_key]) > MAX_HISTORY * 2 + 1:
        conversation_memory[user_key] = [conversation_memory[user_key][0]] + conversation_memory[user_key][-(MAX_HISTORY * 2):]

    return {
        "answer": assistant_reply,
        "options": [
            {"label": "🎟️ My Ticket", "value": "my ticket status"},
            {"label": "🏢 Departments", "value": "list departments"},
            {"label": "❓ Other", "value": "other"}
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
