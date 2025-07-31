import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Home, CheckSquare, FolderKanban, Plus, Trash2, Calendar, Flag, Clock, BarChart3 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// WebSocket connection
let ws = null;

const connectWebSocket = (onMessage) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return ws;
  }
  
  const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
  ws = new WebSocket(`${wsUrl}/ws`);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    // Reconnect after 3 seconds
    setTimeout(() => connectWebSocket(onMessage), 3000);
  };
  
  return ws;
};

// Sortable Task Item Component
const SortableTaskItem = ({ task, onUpdate, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'border-red-400 bg-red-50';
      case 'medium': return 'border-orange-300 bg-orange-50';
      case 'low': return 'border-emerald-300 bg-emerald-50';
      default: return 'border-gray-300 bg-white';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return 'bg-emerald-100 text-emerald-800';
      case 'in-progress': return 'bg-teal-100 text-teal-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`stats-card p-4 mb-3 rounded-xl border-2 cursor-move hover:shadow-lg transition-all duration-200 ${getPriorityColor(task.priority)}`}
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-gray-800 flex-1">{task.title}</h4>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="text-red-500 hover:text-red-700 ml-2"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      {task.description && (
        <p className="text-gray-600 text-sm mb-3">{task.description}</p>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(task.status)}`}>
            {task.status}
          </span>
          <div className="flex items-center text-xs text-gray-500">
            <Flag size={12} className="mr-1" style={{color: '#469d89'}} />
            {task.priority}
          </div>
        </div>
        
        {task.due_date && (
          <div className="flex items-center text-xs text-gray-500">
            <Calendar size={12} className="mr-1" style={{color: '#248277'}} />
            {new Date(task.due_date).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
};

// Navigation Component
const Navigation = () => {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/tasks', label: 'Tasks', icon: CheckSquare },
    { path: '/projects', label: 'Projects', icon: FolderKanban }
  ];
  
  return (
    <nav className="bg-white shadow-sm border-b border-purple-100">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-700 bg-clip-text text-transparent">
              ProjectFlow
            </h1>
            <div className="flex space-x-1">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`nav-item px-4 py-2 rounded-xl flex items-center space-x-2 transition-all duration-200 ${
                    location.pathname === path
                      ? 'nav-item-active bg-purple-100 text-purple-700'
                      : 'nav-item-inactive text-gray-600 hover:bg-purple-50 hover:text-purple-600'
                  }`}
                >
                  <Icon size={18} />
                  <span className="font-medium">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

// Dashboard Component
const Dashboard = () => {
  const [stats, setStats] = useState({
    total_tasks: 0,
    completed_tasks: 0,
    in_progress_tasks: 0,
    pending_tasks: 0,
    total_projects: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get(`${API}/stats`);
        setStats(response.data);
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    { title: 'Total Tasks', value: stats.total_tasks, icon: CheckSquare, className: 'stats-card-total from-purple-500 to-indigo-600' },
    { title: 'Completed', value: stats.completed_tasks, icon: CheckSquare, className: 'stats-card-completed from-green-500 to-emerald-600' },
    { title: 'In Progress', value: stats.in_progress_tasks, icon: Clock, className: 'stats-card-progress from-blue-500 to-cyan-600' },
    { title: 'Pending', value: stats.pending_tasks, icon: Flag, className: 'stats-card-pending from-orange-500 to-red-600' },
    { title: 'Projects', value: stats.total_projects, icon: FolderKanban, className: 'stats-card-projects from-indigo-500 to-purple-600' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Welcome to ProjectFlow</h2>
          <p className="text-gray-600">Manage your tasks and projects with real-time collaboration.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {statCards.map(({ title, value, icon: Icon, className }) => (
            <div key={title} className={`stats-card p-6 rounded-2xl bg-gradient-to-br ${className} shadow-lg hover:shadow-xl transition-all duration-300 hover:transform hover:-translate-y-2`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/90 text-sm font-medium">{title}</p>
                  <p className="text-3xl font-bold mt-1">{value}</p>
                </div>
                <Icon size={32} className="text-white/80" />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="stats-card p-6 rounded-2xl bg-white shadow-lg hover:shadow-xl transition-all duration-300">
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <BarChart3 className="mr-2" style={{color: '#469d89'}} />
              Quick Actions
            </h3>
            <div className="space-y-3">
              <Link to="/tasks" className="block w-full p-3 rounded-xl font-medium transition-colors duration-200" 
                    style={{background: 'linear-gradient(135deg, #99e2b4 0%, #88d4ab 100%)', color: '#036666'}}>
                + Create New Task
              </Link>
              <Link to="/projects" className="block w-full p-3 rounded-xl font-medium transition-colors duration-200"
                    style={{background: 'linear-gradient(135deg, #78c6a3 0%, #67b99a 100%)', color: '#036666'}}>
                + Start New Project
              </Link>
            </div>
          </div>

          <div className="stats-card p-6 rounded-2xl bg-white shadow-lg hover:shadow-xl transition-all duration-300">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Recent Activity</h3>
            <div className="space-y-3 text-gray-600">
              <p className="flex items-center"><Clock size={16} className="mr-2" style={{color: '#469d89'}} /> Real-time updates enabled</p>
              <p className="flex items-center"><CheckSquare size={16} className="mr-2" style={{color: '#248277'}} /> Drag & drop task management</p>
              <p className="flex items-center"><FolderKanban size={16} className="mr-2" style={{color: '#14746f'}} /> Project-based kanban boards</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Tasks Page Component
const TasksPage = () => {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', status: 'todo' });
  const [showAddForm, setShowAddForm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchTasks();
    
    // Connect WebSocket
    connectWebSocket((message) => {
      if (message.type === 'task_created' && !message.task.project_id) {
        setTasks(prev => [...prev, message.task]);
      } else if (message.type === 'task_updated' && !message.task.project_id) {
        setTasks(prev => prev.map(task => task.id === message.task.id ? message.task : task));
      } else if (message.type === 'task_deleted') {
        setTasks(prev => prev.filter(task => task.id !== message.task_id));
      }
    });
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await axios.get(`${API}/tasks`);
      setTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    try {
      await axios.post(`${API}/tasks`, newTask);
      setNewTask({ title: '', description: '', priority: 'medium', status: 'todo' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const updateTask = async (taskId, updates) => {
    try {
      await axios.put(`${API}/tasks/${taskId}`, updates);
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await axios.delete(`${API}/tasks/${taskId}`);
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setTasks((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const statusGroups = {
    todo: tasks.filter(task => task.status === 'todo'),
    'in-progress': tasks.filter(task => task.status === 'in-progress'),
    done: tasks.filter(task => task.status === 'done')
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">My Tasks</h2>
            <p className="text-gray-600">Manage your personal tasks efficiently</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-6 py-3 bg-gradient-to-r text-white rounded-xl font-medium hover:shadow-lg transition-all duration-200 hover:transform hover:-translate-y-1 flex items-center space-x-2"
            style={{background: 'linear-gradient(135deg, #469d89 0%, #358f80 100%)'}}
          >
            <Plus size={20} />
            <span>Add Task</span>
          </button>
        </div>

        {showAddForm && (
          <div className="stats-card p-6 rounded-2xl bg-white shadow-lg mb-8">
            <form onSubmit={createTask} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Task title"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                  style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                  required
                />
                <select
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  className="px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                  style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
              <textarea
                placeholder="Task description (optional)"
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                rows="3"
              />
              <div className="flex space-x-4">
                <button
                  type="submit"
                  className="px-6 py-2 text-white rounded-xl transition-colors duration-200"
                  style={{background: 'linear-gradient(135deg, #469d89 0%, #358f80 100%)'}}
                >
                  Create Task
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-6 py-2 border text-gray-700 rounded-xl hover:bg-gray-50 transition-colors duration-200"
                  style={{borderColor: '#78c6a3'}}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {Object.entries(statusGroups).map(([status, statusTasks]) => (
            <div key={status} className="stats-card p-6 rounded-2xl bg-white shadow-lg">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 capitalize flex items-center">
                {status === 'todo' && <Flag className="mr-2 text-orange-500" />}
                {status === 'in-progress' && <Clock className="mr-2 text-blue-500" />}
                {status === 'done' && <CheckSquare className="mr-2 text-green-500" />}
                {status.replace('-', ' ')} ({statusTasks.length})
              </h3>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={statusTasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {statusTasks.map((task) => (
                      <SortableTaskItem
                        key={task.id}
                        task={task}
                        onUpdate={updateTask}
                        onDelete={deleteTask}
                      />
                    ))}
                    {statusTasks.length === 0 && (
                      <div className="text-center py-8 text-gray-400">
                        <CheckSquare size={48} className="mx-auto mb-2 opacity-50" />
                        <p>No tasks in {status.replace('-', ' ')}</p>
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Projects Page Component
const ProjectsPage = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: 'purple' });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchProjects();
    
    // Connect WebSocket
    connectWebSocket((message) => {
      if (message.type === 'project_created') {
        setProjects(prev => [message.project, ...prev]);
      } else if (message.type === 'project_deleted') {
        setProjects(prev => prev.filter(p => p.id !== message.project_id));
        if (selectedProject && selectedProject.id === message.project_id) {
          setSelectedProject(null);
        }
      }
    });
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${API}/projects`);
      setProjects(response.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!newProject.name.trim()) return;

    try {
      await axios.post(`${API}/projects`, newProject);
      setNewProject({ name: '', description: '', color: 'purple' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const deleteProject = async (projectId) => {
    if (window.confirm('Are you sure you want to delete this project? This will delete all tasks in the project.')) {
      try {
        await axios.delete(`${API}/projects/${projectId}`);
      } catch (error) {
        console.error('Error deleting project:', error);
      }
    }
  };

  if (selectedProject) {
    return <ProjectKanban project={selectedProject} onBack={() => setSelectedProject(null)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Projects</h2>
            <p className="text-gray-600">Organize your work into collaborative projects</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-200 hover:transform hover:-translate-y-1 flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>New Project</span>
          </button>
        </div>

        {showAddForm && (
          <div className="stats-card p-6 rounded-2xl bg-white shadow-lg mb-8">
            <form onSubmit={createProject} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Project name"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                  style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                  required
                />
                <select
                  value={newProject.color}
                  onChange={(e) => setNewProject({ ...newProject, color: e.target.value })}
                  className="px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                  style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                >
                  <option value="purple">Purple</option>
                  <option value="blue">Blue</option>
                  <option value="green">Green</option>
                  <option value="red">Red</option>
                  <option value="yellow">Yellow</option>
                </select>
              </div>
              <textarea
                placeholder="Project description (optional)"
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                rows="3"
              />
              <div className="flex space-x-4">
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors duration-200"
                >
                  Create Project
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="stats-card p-6 rounded-2xl bg-white shadow-lg hover:shadow-xl transition-all duration-300 hover:transform hover:-translate-y-2 cursor-pointer"
              onClick={() => setSelectedProject(project)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`w-4 h-4 rounded-full bg-${project.color}-500`}></div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(project.id);
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">{project.name}</h3>
              {project.description && (
                <p className="text-gray-600 text-sm mb-4">{project.description}</p>
              )}
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                <FolderKanban size={16} />
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="col-span-full text-center py-12">
              <FolderKanban size={64} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-500 mb-2">No projects yet</h3>
              <p className="text-gray-400">Create your first project to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Project Kanban Component
const ProjectKanban = ({ project, onBack }) => {
  const [lists, setLists] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState({ title: '', description: '', list_id: '', priority: 'medium' });
  const [showAddTask, setShowAddTask] = useState(false);

  useEffect(() => {
    fetchProjectData();
    
    // Connect WebSocket for project-specific updates
    connectWebSocket((message) => {
      if (message.type === 'task_created' && message.task.project_id === project.id) {
        setTasks(prev => [...prev, message.task]);
      } else if (message.type === 'task_updated' && message.task.project_id === project.id) {
        setTasks(prev => prev.map(task => task.id === message.task.id ? message.task : task));
      } else if (message.type === 'task_deleted') {
        setTasks(prev => prev.filter(task => task.id !== message.task_id));
      } else if (message.type === 'task_moved') {
        setTasks(prev => prev.map(task => task.id === message.task.id ? message.task : task));
      }
    });
  }, [project.id]);

  const fetchProjectData = async () => {
    try {
      const [listsResponse, tasksResponse] = await Promise.all([
        axios.get(`${API}/projects/${project.id}/lists`),
        axios.get(`${API}/tasks?project_id=${project.id}`)
      ]);
      setLists(listsResponse.data);
      setTasks(tasksResponse.data);
    } catch (error) {
      console.error('Error fetching project data:', error);
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim() || !newTask.list_id) return;

    try {
      await axios.post(`${API}/tasks`, {
        ...newTask,
        project_id: project.id
      });
      setNewTask({ title: '', description: '', list_id: '', priority: 'medium' });
      setShowAddTask(false);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await axios.delete(`${API}/tasks/${taskId}`);
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    
    if (!over) return;

    const activeTask = tasks.find(task => task.id === active.id);
    const overContainer = over.id;

    if (activeTask && activeTask.list_id !== overContainer) {
      // Move task to different list
      try {
        await axios.post(`${API}/tasks/reorder`, {
          task_id: active.id,
          new_list_id: overContainer,
          new_position: 0
        });
      } catch (error) {
        console.error('Error moving task:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-colors duration-200"
            >
              ← Back
            </button>
            <div>
              <h2 className="text-3xl font-bold text-gray-800">{project.name}</h2>
              {project.description && (
                <p className="text-gray-600">{project.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowAddTask(!showAddTask)}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-200 hover:transform hover:-translate-y-1 flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>Add Task</span>
          </button>
        </div>

        {showAddTask && (
          <div className="stats-card p-6 rounded-2xl bg-white shadow-lg mb-8">
            <form onSubmit={createTask} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  placeholder="Task title"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                  style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                  required
                />
                <select
                  value={newTask.list_id}
                  onChange={(e) => setNewTask({ ...newTask, list_id: e.target.value })}
                  className="px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                  style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                  required
                >
                  <option value="">Select list</option>
                  {lists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
                <select
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  className="px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                  style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
              <textarea
                placeholder="Task description (optional)"
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent"
                style={{borderColor: '#78c6a3', focusRingColor: 'rgba(70, 157, 137, 0.2)'}}
                rows="2"
              />
              <div className="flex space-x-4">
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors duration-200"
                >
                  Create Task
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <DndContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {lists.map((list) => {
              const listTasks = tasks.filter(task => task.list_id === list.id);
              
              return (
                <div key={list.id} className="stats-card p-6 rounded-2xl bg-white shadow-lg">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    {list.name} ({listTasks.length})
                  </h3>
                  <SortableContext items={listTasks.map(task => task.id)}>
                    <div
                      className="min-h-[200px] space-y-3"
                      data-list-id={list.id}
                    >
                      {listTasks.map((task) => (
                        <SortableTaskItem
                          key={task.id}
                          task={task}
                          onUpdate={() => {}}
                          onDelete={deleteTask}
                        />
                      ))}
                      {listTasks.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                          <CheckSquare size={32} className="mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Drop tasks here</p>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>
              );
            })}
          </div>
        </DndContext>
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;