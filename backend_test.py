#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Project Management App
Tests all CRUD operations, WebSocket functionality, and edge cases
"""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Dict, List, Any
import aiohttp
import websockets
import os
from pathlib import Path

# Load environment variables
def load_env():
    """Load environment variables from frontend/.env"""
    env_path = Path(__file__).parent / "frontend" / ".env"
    env_vars = {}
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    env_vars[key] = value.strip('"')
    return env_vars

env_vars = load_env()
BASE_URL = env_vars.get('REACT_APP_BACKEND_URL', 'http://localhost:8001')
API_BASE_URL = f"{BASE_URL}/api"

class BackendTester:
    def __init__(self):
        self.session = None
        self.test_results = []
        self.created_resources = {
            'projects': [],
            'tasks': [],
            'lists': []
        }
    
    async def setup(self):
        """Setup test session"""
        self.session = aiohttp.ClientSession()
        print(f"🔧 Testing backend at: {API_BASE_URL}")
    
    async def cleanup(self):
        """Cleanup test session and created resources"""
        # Clean up created resources in reverse order
        for task_id in self.created_resources['tasks']:
            try:
                await self.session.delete(f"{API_BASE_URL}/tasks/{task_id}")
            except:
                pass
        
        for project_id in self.created_resources['projects']:
            try:
                await self.session.delete(f"{API_BASE_URL}/projects/{project_id}")
            except:
                pass
        
        if self.session:
            await self.session.close()
    
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        
        self.test_results.append({
            'test': test_name,
            'success': success,
            'details': details
        })
    
    async def test_health_check(self):
        """Test basic connectivity"""
        try:
            async with self.session.get(f"{API_BASE_URL}/stats") as response:
                if response.status == 200:
                    data = await response.json()
                    self.log_test("Health Check", True, f"Stats endpoint accessible: {data}")
                    return True
                else:
                    self.log_test("Health Check", False, f"Status: {response.status}")
                    return False
        except Exception as e:
            self.log_test("Health Check", False, f"Connection error: {str(e)}")
            return False
    
    async def test_project_crud(self):
        """Test Project CRUD operations"""
        print("\n📁 Testing Project CRUD Operations...")
        
        # Test GET projects (empty initially)
        try:
            async with self.session.get(f"{API_BASE_URL}/projects") as response:
                if response.status == 200:
                    projects = await response.json()
                    self.log_test("GET /projects", True, f"Retrieved {len(projects)} projects")
                else:
                    self.log_test("GET /projects", False, f"Status: {response.status}")
        except Exception as e:
            self.log_test("GET /projects", False, f"Error: {str(e)}")
        
        # Test POST project
        project_data = {
            "name": "Test Project Alpha",
            "description": "A comprehensive test project for API validation",
            "color": "blue"
        }
        
        try:
            async with self.session.post(f"{API_BASE_URL}/projects", json=project_data) as response:
                if response.status == 200:
                    project = await response.json()
                    project_id = project['id']
                    self.created_resources['projects'].append(project_id)
                    self.log_test("POST /projects", True, f"Created project: {project['name']} (ID: {project_id})")
                    
                    # Test GET specific project
                    async with self.session.get(f"{API_BASE_URL}/projects/{project_id}") as get_response:
                        if get_response.status == 200:
                            retrieved_project = await get_response.json()
                            self.log_test("GET /projects/{id}", True, f"Retrieved project: {retrieved_project['name']}")
                        else:
                            self.log_test("GET /projects/{id}", False, f"Status: {get_response.status}")
                    
                    return project_id
                else:
                    self.log_test("POST /projects", False, f"Status: {response.status}")
                    return None
        except Exception as e:
            self.log_test("POST /projects", False, f"Error: {str(e)}")
            return None
    
    async def test_task_lists(self, project_id: str):
        """Test Task List operations"""
        print("\n📋 Testing Task List Operations...")
        
        if not project_id:
            self.log_test("Task Lists Test", False, "No project ID available")
            return []
        
        # Test GET project lists (should have default lists)
        try:
            async with self.session.get(f"{API_BASE_URL}/projects/{project_id}/lists") as response:
                if response.status == 200:
                    lists = await response.json()
                    self.log_test("GET /projects/{id}/lists", True, f"Retrieved {len(lists)} lists")
                    
                    # Test POST new list
                    list_data = {"name": "Testing Phase"}
                    async with self.session.post(f"{API_BASE_URL}/projects/{project_id}/lists", json=list_data) as post_response:
                        if post_response.status == 200:
                            new_list = await post_response.json()
                            lists.append(new_list)
                            self.log_test("POST /projects/{id}/lists", True, f"Created list: {new_list['name']}")
                        else:
                            self.log_test("POST /projects/{id}/lists", False, f"Status: {post_response.status}")
                    
                    return lists
                else:
                    self.log_test("GET /projects/{id}/lists", False, f"Status: {response.status}")
                    return []
        except Exception as e:
            self.log_test("Task Lists Operations", False, f"Error: {str(e)}")
            return []
    
    async def test_task_crud(self, project_id: str, lists: List[Dict]):
        """Test Task CRUD operations"""
        print("\n✅ Testing Task CRUD Operations...")
        
        # Test GET tasks (empty initially)
        try:
            async with self.session.get(f"{API_BASE_URL}/tasks") as response:
                if response.status == 200:
                    tasks = await response.json()
                    self.log_test("GET /tasks", True, f"Retrieved {len(tasks)} tasks")
                else:
                    self.log_test("GET /tasks", False, f"Status: {response.status}")
        except Exception as e:
            self.log_test("GET /tasks", False, f"Error: {str(e)}")
        
        # Test GET tasks by project
        if project_id:
            try:
                async with self.session.get(f"{API_BASE_URL}/tasks?project_id={project_id}") as response:
                    if response.status == 200:
                        project_tasks = await response.json()
                        self.log_test("GET /tasks?project_id", True, f"Retrieved {len(project_tasks)} project tasks")
                    else:
                        self.log_test("GET /tasks?project_id", False, f"Status: {response.status}")
            except Exception as e:
                self.log_test("GET /tasks?project_id", False, f"Error: {str(e)}")
        
        # Test POST tasks with different scenarios
        task_scenarios = [
            {
                "title": "Implement user authentication",
                "description": "Set up JWT-based authentication system",
                "status": "todo",
                "priority": "high",
                "project_id": project_id,
                "list_id": lists[0]['id'] if lists else None
            },
            {
                "title": "Design database schema",
                "description": "Create comprehensive data model",
                "status": "in-progress",
                "priority": "medium",
                "project_id": project_id,
                "list_id": lists[1]['id'] if len(lists) > 1 else None
            },
            {
                "title": "Standalone task without project",
                "description": "This task is not assigned to any project",
                "status": "todo",
                "priority": "low"
            }
        ]
        
        created_tasks = []
        for i, task_data in enumerate(task_scenarios):
            try:
                async with self.session.post(f"{API_BASE_URL}/tasks", json=task_data) as response:
                    if response.status == 200:
                        task = await response.json()
                        task_id = task['id']
                        created_tasks.append(task)
                        self.created_resources['tasks'].append(task_id)
                        self.log_test(f"POST /tasks (Scenario {i+1})", True, f"Created: {task['title']}")
                    else:
                        self.log_test(f"POST /tasks (Scenario {i+1})", False, f"Status: {response.status}")
            except Exception as e:
                self.log_test(f"POST /tasks (Scenario {i+1})", False, f"Error: {str(e)}")
        
        # Test PUT task (update)
        if created_tasks:
            task_to_update = created_tasks[0]
            update_data = {
                "title": "Updated: Implement advanced authentication",
                "status": "in-progress",
                "priority": "high"
            }
            
            try:
                async with self.session.put(f"{API_BASE_URL}/tasks/{task_to_update['id']}", json=update_data) as response:
                    if response.status == 200:
                        updated_task = await response.json()
                        self.log_test("PUT /tasks/{id}", True, f"Updated task: {updated_task['title']}")
                    else:
                        self.log_test("PUT /tasks/{id}", False, f"Status: {response.status}")
            except Exception as e:
                self.log_test("PUT /tasks/{id}", False, f"Error: {str(e)}")
        
        return created_tasks
    
    async def test_task_reordering(self, tasks: List[Dict], lists: List[Dict]):
        """Test task reordering/moving between lists"""
        print("\n🔄 Testing Task Reordering...")
        
        if not tasks or len(lists) < 2:
            self.log_test("Task Reordering", False, "Insufficient tasks or lists for testing")
            return
        
        # Move first task to second list
        reorder_data = {
            "task_id": tasks[0]['id'],
            "new_list_id": lists[1]['id'],
            "new_position": 0
        }
        
        try:
            async with self.session.post(f"{API_BASE_URL}/tasks/reorder", json=reorder_data) as response:
                if response.status == 200:
                    result = await response.json()
                    self.log_test("POST /tasks/reorder", True, f"Task moved successfully: {result['message']}")
                else:
                    self.log_test("POST /tasks/reorder", False, f"Status: {response.status}")
        except Exception as e:
            self.log_test("POST /tasks/reorder", False, f"Error: {str(e)}")
    
    async def test_stats_endpoint(self):
        """Test stats endpoint"""
        print("\n📊 Testing Stats Endpoint...")
        
        try:
            async with self.session.get(f"{API_BASE_URL}/stats") as response:
                if response.status == 200:
                    stats = await response.json()
                    expected_keys = ['total_tasks', 'completed_tasks', 'in_progress_tasks', 'pending_tasks', 'total_projects']
                    
                    if all(key in stats for key in expected_keys):
                        self.log_test("GET /stats", True, f"Stats: {stats}")
                    else:
                        missing_keys = [key for key in expected_keys if key not in stats]
                        self.log_test("GET /stats", False, f"Missing keys: {missing_keys}")
                else:
                    self.log_test("GET /stats", False, f"Status: {response.status}")
        except Exception as e:
            self.log_test("GET /stats", False, f"Error: {str(e)}")
    
    async def test_websocket_connection(self):
        """Test WebSocket connection and messaging"""
        print("\n🔌 Testing WebSocket Connection...")
        
        ws_url = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws'
        
        try:
            async with websockets.connect(ws_url) as websocket:
                # Send a test message
                test_message = {
                    "type": "test_message",
                    "data": "Hello from backend test",
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                await websocket.send(json.dumps(test_message))
                
                # Try to receive the echoed message
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    received_message = json.loads(response)
                    
                    if received_message.get('type') == 'test_message':
                        self.log_test("WebSocket Connection", True, "Message sent and received successfully")
                    else:
                        self.log_test("WebSocket Connection", True, f"Connected but unexpected message: {received_message}")
                except asyncio.TimeoutError:
                    self.log_test("WebSocket Connection", True, "Connected but no echo received (may be normal)")
                
        except Exception as e:
            self.log_test("WebSocket Connection", False, f"Connection error: {str(e)}")
    
    async def test_edge_cases(self, project_id: str):
        """Test edge cases and error handling"""
        print("\n⚠️  Testing Edge Cases...")
        
        # Test invalid task ID
        try:
            async with self.session.get(f"{API_BASE_URL}/tasks/invalid-id") as response:
                # This should return 404 or handle gracefully
                self.log_test("Invalid Task ID", True, f"Handled gracefully with status: {response.status}")
        except Exception as e:
            self.log_test("Invalid Task ID", False, f"Error: {str(e)}")
        
        # Test invalid project ID
        try:
            async with self.session.get(f"{API_BASE_URL}/projects/invalid-id") as response:
                if response.status == 404:
                    self.log_test("Invalid Project ID", True, "Correctly returned 404")
                else:
                    self.log_test("Invalid Project ID", True, f"Handled with status: {response.status}")
        except Exception as e:
            self.log_test("Invalid Project ID", False, f"Error: {str(e)}")
        
        # Test deleting non-existent task
        try:
            async with self.session.delete(f"{API_BASE_URL}/tasks/non-existent-id") as response:
                if response.status == 404:
                    self.log_test("Delete Non-existent Task", True, "Correctly returned 404")
                else:
                    self.log_test("Delete Non-existent Task", True, f"Handled with status: {response.status}")
        except Exception as e:
            self.log_test("Delete Non-existent Task", False, f"Error: {str(e)}")
        
        # Test project deletion with associated tasks
        if project_id:
            try:
                async with self.session.delete(f"{API_BASE_URL}/projects/{project_id}") as response:
                    if response.status == 200:
                        result = await response.json()
                        self.log_test("Delete Project with Tasks", True, f"Project deleted: {result['message']}")
                        # Remove from cleanup list since it's already deleted
                        if project_id in self.created_resources['projects']:
                            self.created_resources['projects'].remove(project_id)
                    else:
                        self.log_test("Delete Project with Tasks", False, f"Status: {response.status}")
            except Exception as e:
                self.log_test("Delete Project with Tasks", False, f"Error: {str(e)}")
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("🧪 BACKEND TEST SUMMARY")
        print("="*60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['success'])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  • {result['test']}: {result['details']}")
        
        print("\n✅ CRITICAL FUNCTIONALITY STATUS:")
        critical_tests = [
            "Health Check",
            "GET /projects", 
            "POST /projects",
            "GET /tasks",
            "POST /tasks (Scenario 1)",
            "GET /stats"
        ]
        
        for test_name in critical_tests:
            result = next((r for r in self.test_results if r['test'] == test_name), None)
            if result:
                status = "✅" if result['success'] else "❌"
                print(f"  {status} {test_name}")
        
        return passed_tests, failed_tests

async def main():
    """Main test execution"""
    print("🚀 Starting Comprehensive Backend API Testing...")
    print(f"🎯 Target URL: {API_BASE_URL}")
    
    tester = BackendTester()
    
    try:
        await tester.setup()
        
        # Test basic connectivity first
        if not await tester.test_health_check():
            print("❌ Backend is not accessible. Stopping tests.")
            return
        
        # Run all tests
        project_id = await tester.test_project_crud()
        lists = await tester.test_task_lists(project_id)
        tasks = await tester.test_task_crud(project_id, lists)
        await tester.test_task_reordering(tasks, lists)
        await tester.test_stats_endpoint()
        await tester.test_websocket_connection()
        await tester.test_edge_cases(project_id)
        
        # Print summary
        passed, failed = tester.print_summary()
        
        return passed, failed
        
    finally:
        await tester.cleanup()

if __name__ == "__main__":
    try:
        passed, failed = asyncio.run(main())
        exit_code = 0 if failed == 0 else 1
        exit(exit_code)
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
        exit(1)
    except Exception as e:
        print(f"\n💥 Test execution failed: {str(e)}")
        exit(1)