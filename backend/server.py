from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import os
import uuid
import json
import logging
from pathlib import Path
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                print(f"Failed to send message to client: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection)

manager = ConnectionManager()

# Models
class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = ""
    status: str = "todo"  # todo, in-progress, done
    priority: str = "medium"  # low, medium, high
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    project_id: Optional[str] = None
    list_id: Optional[str] = None
    position: int = 0

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    status: str = "todo"
    priority: str = "medium"
    due_date: Optional[datetime] = None
    project_id: Optional[str] = None
    list_id: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    list_id: Optional[str] = None
    position: Optional[int] = None

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    color: str = "purple"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: str = "purple"

class TaskList(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    project_id: str
    position: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TaskListCreate(BaseModel):
    name: str

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            # Echo the message back to all connected clients
            await manager.broadcast(message)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Task endpoints
@api_router.get("/tasks", response_model=List[Task])
async def get_tasks(project_id: Optional[str] = None):
    query = {}
    if project_id:
        query["project_id"] = project_id
    else:
        query["project_id"] = None
    
    tasks = await db.tasks.find(query).sort("position", 1).to_list(1000)
    return [Task(**task) for task in tasks]

@api_router.post("/tasks", response_model=Task)
async def create_task(task: TaskCreate):
    task_dict = task.dict()
    
    # Get the next position
    query = {"project_id": task.project_id, "list_id": task.list_id}
    count = await db.tasks.count_documents(query)
    task_dict["position"] = count
    
    task_obj = Task(**task_dict)
    await db.tasks.insert_one(task_obj.dict())
    
    # Broadcast the change
    await manager.broadcast({
        "type": "task_created",
        "task": task_obj.dict()
    })
    
    return task_obj

@api_router.put("/tasks/{task_id}", response_model=Task)
async def update_task(task_id: str, task_update: TaskUpdate):
    update_dict = {k: v for k, v in task_update.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    result = await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    updated_task = await db.tasks.find_one({"id": task_id})
    task_obj = Task(**updated_task)
    
    # Broadcast the change
    await manager.broadcast({
        "type": "task_updated",
        "task": task_obj.dict()
    })
    
    return task_obj

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    result = await db.tasks.delete_one({"id": task_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Broadcast the change
    await manager.broadcast({
        "type": "task_deleted",
        "task_id": task_id
    })
    
    return {"message": "Task deleted successfully"}

@api_router.post("/tasks/reorder")
async def reorder_tasks(data: Dict[str, Any]):
    task_id = data.get("task_id")
    new_list_id = data.get("new_list_id")
    new_position = data.get("new_position", 0)
    
    # Update task position and list
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"list_id": new_list_id, "position": new_position, "updated_at": datetime.utcnow()}}
    )
    
    updated_task = await db.tasks.find_one({"id": task_id})
    task_obj = Task(**updated_task)
    
    # Broadcast the change
    await manager.broadcast({
        "type": "task_moved",
        "task": task_obj.dict()
    })
    
    return {"message": "Task reordered successfully"}

# Project endpoints
@api_router.get("/projects", response_model=List[Project])
async def get_projects():
    projects = await db.projects.find().sort("created_at", -1).to_list(1000)
    return [Project(**project) for project in projects]

@api_router.post("/projects", response_model=Project)
async def create_project(project: ProjectCreate):
    project_obj = Project(**project.dict())
    await db.projects.insert_one(project_obj.dict())
    
    # Create default lists for the project
    default_lists = ["To Do", "In Progress", "Done"]
    for i, list_name in enumerate(default_lists):
        list_obj = TaskList(
            name=list_name,
            project_id=project_obj.id,
            position=i
        )
        await db.task_lists.insert_one(list_obj.dict())
    
    # Broadcast the change
    await manager.broadcast({
        "type": "project_created",
        "project": project_obj.dict()
    })
    
    return project_obj

@api_router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return Project(**project)

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    # Delete all tasks in the project
    await db.tasks.delete_many({"project_id": project_id})
    # Delete all lists in the project
    await db.task_lists.delete_many({"project_id": project_id})
    # Delete the project
    result = await db.projects.delete_one({"id": project_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Broadcast the change
    await manager.broadcast({
        "type": "project_deleted",
        "project_id": project_id
    })
    
    return {"message": "Project deleted successfully"}

# Task List endpoints
@api_router.get("/projects/{project_id}/lists", response_model=List[TaskList])
async def get_project_lists(project_id: str):
    lists = await db.task_lists.find({"project_id": project_id}).sort("position", 1).to_list(1000)
    return [TaskList(**task_list) for task_list in lists]

@api_router.post("/projects/{project_id}/lists", response_model=TaskList)
async def create_list(project_id: str, task_list: TaskListCreate):
    # Get the next position
    count = await db.task_lists.count_documents({"project_id": project_id})
    
    list_obj = TaskList(
        name=task_list.name,
        project_id=project_id,
        position=count
    )
    await db.task_lists.insert_one(list_obj.dict())
    
    # Broadcast the change
    await manager.broadcast({
        "type": "list_created",
        "list": list_obj.dict()
    })
    
    return list_obj

# Stats endpoint
@api_router.get("/stats")
async def get_stats():
    total_tasks = await db.tasks.count_documents({})
    completed_tasks = await db.tasks.count_documents({"status": "done"})
    in_progress_tasks = await db.tasks.count_documents({"status": "in-progress"})
    total_projects = await db.projects.count_documents({})
    
    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "in_progress_tasks": in_progress_tasks,
        "pending_tasks": total_tasks - completed_tasks - in_progress_tasks,
        "total_projects": total_projects
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()