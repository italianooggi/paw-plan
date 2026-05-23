package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// --- Server structures ---

type Task struct {
	Title  string `json:"title"`
	Status string `json:"status"`
}

type ProjectState struct {
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	ProjectPath string `json:"projectPath"`
	Vision      string `json:"vision"`
	Plan        []Task `json:"plan"`
	CurrentHito int    `json:"currentHito"`
	AgentState  string `json:"agentState"` // working, running, thinking, etc.
	LastSeen    time.Time
}

type ServerMessage struct {
	Type        string         `json:"type"`
	ProjectID   string         `json:"projectId,omitempty"`
	ProjectName string         `json:"projectName,omitempty"`
	ProjectPath string         `json:"projectPath,omitempty"`
	Text        string         `json:"text,omitempty"`
	Message     string         `json:"message,omitempty"`
	Index       int            `json:"index,omitempty"`
	HadPlan     bool           `json:"hadPlan,omitempty"`
	Plan        []Task         `json:"plan,omitempty"`
	AgentState  string         `json:"agentState,omitempty"`
	States      []ProjectState `json:"states,omitempty"` // For GUI full sync
}

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow local connections
		},
	}

	// In-memory store of active projects
	projects = make(map[string]*ProjectState)
	mu       sync.RWMutex

	// Connected GUI clients
	guiClients = make(map[*websocket.Conn]bool)
	guiMu      sync.Mutex
)

func broadcastToGUIs(msg []byte) {
	guiMu.Lock()
	defer guiMu.Unlock()
	for conn := range guiClients {
		if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			log.Printf("GUI connection lost, removing: %v", err)
			conn.Close()
			delete(guiClients, conn)
		}
	}
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS Upgrade error: %v", err)
		return
	}
	defer conn.Close()

	log.Println("New client connected to Go Daemon")

	// Determine client type (GUI or CLI) based on query param or first message
	isGUI := r.URL.Query().Get("client") == "gui"
	if isGUI {
		guiMu.Lock()
		guiClients[conn] = true
		guiMu.Unlock()
		log.Println("GUI client registered")

		// Send initial sync state of all projects
		mu.RLock()
		states := make([]ProjectState, 0, len(projects))
		for _, p := range projects {
			states = append(states, *p)
		}
		mu.RUnlock()

		syncMsg := ServerMessage{
			Type:   "GUI_SYNC",
			States: states,
		}
		if payload, err := json.Marshal(syncMsg); err == nil {
			conn.WriteMessage(websocket.TextMessage, payload)
		}
	}

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if isGUI {
				guiMu.Lock()
				delete(guiClients, conn)
				guiMu.Unlock()
				log.Println("GUI client disconnected")
			} else {
				log.Println("CLI client disconnected")
			}
			break
		}

		var msg ServerMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		// Update in-memory state if message comes from CLI
		if !isGUI && msg.ProjectID != "" {
			updateProjectState(&msg)
		}

		// Forward the event to all active GUIs
		broadcastToGUIs(message)
	}
}

func updateProjectState(msg *ServerMessage) {
	mu.Lock()
	defer mu.Unlock()

	p, exists := projects[msg.ProjectID]
	if !exists {
		p = &ProjectState{
			ProjectID:   msg.ProjectID,
			ProjectName: msg.ProjectName,
			ProjectPath: msg.ProjectPath,
			AgentState:  "idle",
		}
		projects[msg.ProjectID] = p
	}

	p.LastSeen = time.Now()
	if msg.ProjectName != "" {
		p.ProjectName = msg.ProjectName
	}
	if msg.ProjectPath != "" {
		p.ProjectPath = msg.ProjectPath
	}

	// Update fields based on message type
	switch msg.Type {
	case "SET_VISION":
		p.Vision = msg.Text
	case "SET_PLAN":
		p.Plan = msg.Plan
		p.CurrentHito = -1
	case "UPDATE_PROGRESS":
		p.CurrentHito = msg.Index
		if msg.Index >= 0 && msg.Index < len(p.Plan) {
			p.Plan[msg.Index].Status = "done"
		}
	case "ALL_DONE":
		p.CurrentHito = len(p.Plan) - 1
		for i := range p.Plan {
			p.Plan[i].Status = "done"
		}
	case "PING":
		// Wake up / Keep-alive
	case "WORKING":
		p.AgentState = "working"
	case "RUNNING":
		p.AgentState = "running"
	case "EXPLORING":
		p.AgentState = "exploring"
	case "THINKING":
		p.AgentState = "thinking"
	case "CLIMBING":
		p.AgentState = "climbing"
	case "STOP":
		p.AgentState = "idle"
	case "SLEEPING":
		p.AgentState = "sleeping"
	case "WAITING_INPUT":
		p.AgentState = "waiting"
	case "DANGER":
		p.AgentState = "danger"
	case "MISTAKE":
		p.AgentState = "error"
	case "PLAN_CHANGED":
		p.AgentState = "fall"
	}
}

func main() {
	// Clean up stale projects (inactive for more than 1 hour)
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			mu.Lock()
			for id, p := range projects {
				if time.Since(p.LastSeen) > 1*time.Hour {
					log.Printf("Removing inactive project from memory: %s", p.ProjectName)
					delete(projects, id)
				}
			}
			mu.Unlock()
		}
	}()

	http.HandleFunc("/ws", handleWS)
	// Fallback to support direct connection on root path
	http.HandleFunc("/", handleWS)

	port := ":9123"
	log.Printf("Starting paw-plan Go Daemon on 127.0.0.1%s", port)
	if err := http.ListenAndServe("127.0.0.1"+port, nil); err != nil {
		log.Fatalf("Daemon failed to start: %v", err)
	}
}
