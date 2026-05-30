package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// --- Structs representing the state.json schema ---

type HistorySummary struct {
	Headline     string   `json:"headline"`
	Outcome      string   `json:"outcome"`
	KeyDecisions []string `json:"keyDecisions"`
}

type HistoryEntry struct {
	StartedAt string         `json:"startedAt"`
	EndedAt   string         `json:"endedAt"`
	Status    string         `json:"status"`
	Pinned    bool           `json:"pinned"`
	Summary   HistorySummary `json:"summary"`
}

type Task struct {
	Title  string `json:"title"`
	Status string `json:"status"` // "pending" | "done"
}

type CurrentState struct {
	StartedAt        string    `json:"startedAt"`
	EndedAt          string    `json:"endedAt,omitempty"`
	Vision           string    `json:"vision"`
	Tasks            []Task    `json:"tasks"`
	Discoveries      []string  `json:"discoveries"`
	Blockers         []string  `json:"blockers"`
	LastTouchedFiles []string  `json:"lastTouchedFiles"`
}

type State struct {
	Version   int            `json:"version"`
	ProjectID string         `json:"projectId"`
	ProjectName string       `json:"projectName"`
	History   []HistoryEntry `json:"history"`
	Current   CurrentState   `json:"current"`
}

// --- WS message structure ---

type WSMessage struct {
	Type        string `json:"type"`
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	ProjectPath string `json:"projectPath"`
	Text        string `json:"text,omitempty"`
	Message     string `json:"message,omitempty"`
	Index       int    `json:"index,omitempty"`
	HadPlan     bool   `json:"hadPlan,omitempty"`
	Plan        []Task `json:"plan,omitempty"`
	Error       string `json:"error,omitempty"`
}

// --- Helpers ---

func findGitRoot(startDir string) string {
	dir, err := filepath.Abs(startDir)
	if err != nil {
		dir = startDir
	}
	for {
		gitDir := filepath.Join(dir, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			return dir
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return startDir
}

func getProjectMetadata(customID, customName string) (string, string, string) {
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}
	repoPath := findGitRoot(filepath.Clean(cwd))

	var projectID string
	if customID != "" {
		projectID = customID
	} else {
		b64 := base64.StdEncoding.EncodeToString([]byte(repoPath))
		repl := strings.NewReplacer("/", "", "+", "", "=", "")
		cleanB64 := repl.Replace(b64)
		if len(cleanB64) > 10 {
			cleanB64 = cleanB64[:10]
		}
		projectID = cleanB64
	}

	var projectName string
	if customName != "" {
		projectName = customName
	} else {
		projectName = filepath.Base(repoPath)
	}

	return projectID, projectName, repoPath
}

func ensureStateDir(projectPath string) string {
	stateDir := filepath.Join(projectPath, ".paw-plan")
	if _, err := os.Stat(stateDir); os.IsNotExist(err) {
		os.MkdirAll(stateDir, 0755)
	}

	gitignoreFile := filepath.Join(stateDir, ".gitignore")
	if _, err := os.Stat(gitignoreFile); os.IsNotExist(err) {
		os.WriteFile(gitignoreFile, []byte("*\n!.gitignore\n"), 0644)
	}

	return filepath.Join(stateDir, "state.json")
}

func readState(stateFilePath, projectID, projectName string) *State {
	if _, err := os.Stat(stateFilePath); os.IsNotExist(err) {
		return &State{
			Version:     1,
			ProjectID:   projectID,
			ProjectName: projectName,
			History:     []HistoryEntry{},
			Current: CurrentState{
				StartedAt:        time.Now().Format(time.RFC3339),
				Vision:           "",
				Tasks:            []Task{},
				Discoveries:      []string{},
				Blockers:         []string{},
				LastTouchedFiles: []string{},
			},
		}
	}

	data, err := os.ReadFile(stateFilePath)
	if err != nil {
		return nil
	}

	var s State
	if err := json.Unmarshal(data, &s); err != nil {
		return nil
	}
	return &s
}

func writeState(stateFilePath string, state *State) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(stateFilePath, data, 0644)
}

func archiveCurrent(state *State, replacedAt string) {
	cur := state.Current
	if len(cur.Tasks) == 0 {
		return
	}

	total := len(cur.Tasks)
	done := 0
	for _, t := range cur.Tasks {
		if t.Status == "done" {
			done++
		}
	}

	status := "not-started"
	if done > 0 {
		if done == total {
			status = "completed"
		} else {
			status = "partial"
		}
	}

	headline := cur.Vision
	if headline == "" && len(cur.Tasks) > 0 {
		headline = cur.Tasks[0].Title
	}
	if len(headline) > 100 {
		headline = headline[:100]
	}

	outcome := fmt.Sprintf("%d de %d tareas completadas.", done, total)

	entry := HistoryEntry{
		StartedAt: cur.StartedAt,
		EndedAt:   replacedAt,
		Status:    status,
		Pinned:    false,
		Summary: HistorySummary{
			Headline:     headline,
			Outcome:      outcome,
			KeyDecisions: []string{},
		},
	}

	// Filter history (max 3 total entries excluding pinned)
	pinned := []HistoryEntry{}
	unpinned := []HistoryEntry{}
	for _, h := range state.History {
		if h.Pinned {
			pinned = append(pinned, h)
		} else {
			unpinned = append(unpinned, h)
		}
	}

	// keep up to 2 unpinned, then prepended the new one
	if len(unpinned) > 2 {
		unpinned = unpinned[:2]
	}
	state.History = append([]HistoryEntry{entry}, append(unpinned, pinned...)...)
}

func sendWSEvent(msg *WSMessage) {
	dialer := websocket.Dialer{
		HandshakeTimeout: 1 * time.Second,
	}
	conn, _, err := dialer.Dial("ws://127.0.0.1:9123", nil)
	if err != nil {
		// Widget not reachable, fail silently as per protocol
		return
	}
	defer conn.Close()

	payload, err := json.Marshal(msg)
	if err != nil {
		return
	}

	conn.WriteMessage(websocket.TextMessage, payload)
	// Give a small amount of time for WS to flush
	time.Sleep(50 * time.Millisecond)
}

func main() {
	args := os.Args[1:]

	// Parse flags and action
	customID := ""
	customName := ""
	action := ""
	restArgs := []string{}

	idRegex := regexp.MustCompile(`^--project-id=(.+)$`)
	nameRegex := regexp.MustCompile(`^--project-name=(.+)$`)

	for _, a := range args {
		if idRegex.MatchString(a) {
			customID = idRegex.FindStringSubmatch(a)[1]
		} else if nameRegex.MatchString(a) {
			customName = nameRegex.FindStringSubmatch(a)[1]
		} else if strings.HasPrefix(a, "--") {
			// Ignore other flags
		} else {
			if action == "" {
				action = a
			} else {
				restArgs = append(restArgs, a)
			}
		}
	}

	projectID, projectName, projectPath := getProjectMetadata(customID, customName)
	stateFilePath := ensureStateDir(projectPath)

	if action == "" {
		printUsage()
		os.Exit(1)
	}

	// WS mapping action helpers
	actionMap := map[string]string{
		"ping":         "PING",
		"working":      "WORKING",
		"attack":       "WORKING",
		"running":      "RUNNING",
		"run":          "RUNNING",
		"exploring":    "EXPLORING",
		"explore":      "EXPLORING",
		"thinking":     "THINKING",
		"think":        "THINKING",
		"climbing":     "CLIMBING",
		"climb":        "CLIMBING",
		"idle":         "STOP",
		"sleeping":     "SLEEPING",
		"sleep":        "SLEEPING",
		"waiting":      "WAITING_INPUT",
		"wait-input":   "WAITING_INPUT",
		"danger":       "DANGER",
		"error":        "MISTAKE",
		"die":          "MISTAKE",
		"fall":         "PLAN_CHANGED",
	}

	argText := strings.Join(restArgs, " ")

	switch action {
	case "get-plan", "get-state":
		dialer := websocket.Dialer{HandshakeTimeout: 2 * time.Second}
		conn, _, err := dialer.Dial("ws://127.0.0.1:9123", nil)
		if err != nil {
			fmt.Println("Widget not reachable (is it running on port 9123?)")
			os.Exit(1)
		}
		defer conn.Close()

		msg := WSMessage{
			Type:        "GET_STATE",
			ProjectID:   projectID,
			ProjectName: projectName,
			ProjectPath: projectPath,
		}
		payload, _ := json.Marshal(msg)
		conn.WriteMessage(websocket.TextMessage, payload)

		_, reply, err := conn.ReadMessage()
		if err != nil {
			fmt.Println("Error reading response from widget")
			os.Exit(1)
		}

		var res WSMessage
		if err := json.Unmarshal(reply, &res); err != nil {
			fmt.Println("Error parsing response:", string(reply))
			os.Exit(1)
		}

		if res.Error != "" {
			fmt.Println("Error from widget:", res.Error)
			os.Exit(1)
		}

		prettyJSON, _ := json.MarshalIndent(res, "", "  ")
		fmt.Println(string(prettyJSON))

	case "vision":
		if argText == "" {
			fmt.Println("Usage: paw-plan vision \"Your project vision\"")
			os.Exit(1)
		}

		state := readState(stateFilePath, projectID, projectName)
		state.Current.Vision = argText
		writeState(stateFilePath, state)

		fmt.Printf("Setting vision: \"%s\"\n", argText)
		sendWSEvent(&WSMessage{
			Type:        "SET_VISION",
			ProjectID:   projectID,
			ProjectName: projectName,
			ProjectPath: projectPath,
			Text:        argText,
		})

	case "sync":
		filePath := "task.md"
		if argText != "" {
			filePath = argText
		}

		contentBytes, err := os.ReadFile(filePath)
		if err != nil {
			fmt.Printf("Error reading %s: %v\n", filePath, err)
			os.Exit(1)
		}

		taskRegex := regexp.MustCompile(`(?m)^\s*-\s*\[([ x/])\]\s*(.+)$`)
		matches := taskRegex.FindAllStringSubmatch(string(contentBytes), -1)

		parsedPlan := []Task{}
		for _, m := range matches {
			status := "pending"
			if m[1] == "x" {
				status = "done"
			}
			parsedPlan = append(parsedPlan, Task{
				Title:  strings.TrimSpace(m[2]),
				Status: status,
			})
		}

		if len(parsedPlan) == 0 {
			fmt.Printf("No tasks found in %s. Use format: - [ ] Task Name\n", filePath)
			os.Exit(1)
		}

		state := readState(stateFilePath, projectID, projectName)
		hadPlan := len(state.Current.Tasks) > 0
		if hadPlan {
			archiveCurrent(state, time.Now().Format(time.RFC3339))
		}

		state.Current.StartedAt = time.Now().Format(time.RFC3339)
		state.Current.Tasks = parsedPlan
		state.Current.Discoveries = []string{}
		writeState(stateFilePath, state)

		fmt.Printf("Syncing plan from %s (%d tasks)...\n", filePath, len(parsedPlan))

		// Send plan setup
		sendWSEvent(&WSMessage{
			Type:        "SET_PLAN",
			ProjectID:   projectID,
			ProjectName: projectName,
			ProjectPath: projectPath,
			Plan:        parsedPlan,
			HadPlan:     hadPlan,
		})

		// Send progress updates for already completed tasks
		for i, t := range parsedPlan {
			if t.Status == "done" {
				time.Sleep(100 * time.Millisecond)
				sendWSEvent(&WSMessage{
					Type:        "UPDATE_PROGRESS",
					ProjectID:   projectID,
					ProjectName: projectName,
					ProjectPath: projectPath,
					Index:       i,
					Message:     "✅ " + t.Title,
				})
			}
		}

	case "set-plan":
		if argText == "" {
			fmt.Println("set-plan requires valid JSON: '[{\"title\":\"...\"}]'")
			os.Exit(1)
		}

		var parsedPlan []Task
		if err := json.Unmarshal([]byte(argText), &parsedPlan); err != nil {
			fmt.Println("set-plan requires valid JSON: '[{\"title\":\"...\"}]'")
			os.Exit(1)
		}

		state := readState(stateFilePath, projectID, projectName)
		hadPlan := len(state.Current.Tasks) > 0
		if hadPlan {
			archiveCurrent(state, time.Now().Format(time.RFC3339))
		}

		state.Current.StartedAt = time.Now().Format(time.RFC3339)
		state.Current.Tasks = parsedPlan
		state.Current.Discoveries = []string{}
		writeState(stateFilePath, state)

		sendWSEvent(&WSMessage{
			Type:        "SET_PLAN",
			ProjectID:   projectID,
			ProjectName: projectName,
			ProjectPath: projectPath,
			Plan:        parsedPlan,
			HadPlan:     hadPlan,
		})

	case "progress", "done":
		if len(restArgs) == 0 {
			fmt.Printf("Usage: paw-plan %s <index> [msg]\n", action)
			os.Exit(1)
		}

		idx, err := strconv.Atoi(restArgs[0])
		if err != nil {
			fmt.Printf("Usage: paw-plan %s <index> [msg]\n", action)
			os.Exit(1)
		}

		state := readState(stateFilePath, projectID, projectName)
		if idx < 0 || idx >= len(state.Current.Tasks) {
			fmt.Printf("Task index %d out of bounds (0-%d)\n", idx, len(state.Current.Tasks)-1)
			os.Exit(1)
		}

		state.Current.Tasks[idx].Status = "done"
		writeState(stateFilePath, state)

		msgText := ""
		if len(restArgs) > 1 {
			msgText = strings.Join(restArgs[1:], " ")
		}

		sendWSEvent(&WSMessage{
			Type:        "UPDATE_PROGRESS",
			ProjectID:   projectID,
			ProjectName: projectName,
			ProjectPath: projectPath,
			Index:       idx,
			Message:     msgText,
		})

	case "all-done":
		state := readState(stateFilePath, projectID, projectName)
		for i := range state.Current.Tasks {
			state.Current.Tasks[i].Status = "done"
		}
		state.Current.EndedAt = time.Now().Format(time.RFC3339)
		writeState(stateFilePath, state)

		sendWSEvent(&WSMessage{
			Type:        "ALL_DONE",
			ProjectID:   projectID,
			ProjectName: projectName,
			ProjectPath: projectPath,
			Message:     argText,
		})

	default:
		// Map generic state/animation actions
		wsType, ok := actionMap[action]
		if !ok {
			printUsage()
			os.Exit(1)
		}

		sendWSEvent(&WSMessage{
			Type:        wsType,
			ProjectID:   projectID,
			ProjectName: projectName,
			ProjectPath: projectPath,
			Message:     argText,
		})
		fmt.Printf("Event [%s] sent for project: %s (#%s)\n", action, projectName, projectID[:4])
	}
}

func printUsage() {
	fmt.Println("paw-plan (Go version) — commands:")
	fmt.Println()
	fmt.Println("  vision \"text\"          North star del proyecto")
	fmt.Println("  sync [file.md]         Carga plan desde markdown")
	fmt.Println("  set-plan <json>        Setea plan desde JSON")
	fmt.Println("  done <index>           Marca tarea como completa")
	fmt.Println("  all-done               Todas las tareas completas")
	fmt.Println("  get-plan               Lee estado actual del widget")
	fmt.Println()
	fmt.Println("  working / running / exploring / thinking / climbing")
	fmt.Println("  waiting \"msg\"          Necesita input del usuario")
	fmt.Println("  idle / sleeping / ping")
	fmt.Println()
	fmt.Println("  danger \"msg\"           Operación de riesgo")
	fmt.Println("  error \"msg\"            Error grave")
	fmt.Println("  fall \"msg\"             Plan cambió")
}
