package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/gorilla/websocket"
)

// wsFrame mirrors ws.Frame in the server package to avoid cross-import.
type wsFrame struct {
	Type      string          `json:"type"`
	Seq       int64           `json:"seq,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

func Run(ctx context.Context, cfg daemonconfig.Config) error {
	if cfg.Token == "" {
		return fmt.Errorf("not logged in. Run 'gitsquad daemon login' first")
	}
	if cfg.ID == "" {
		return fmt.Errorf("daemon id missing. Run 'gitsquad daemon login' first")
	}

	wsURL := wsURL(cfg.APIURL)
	slog.Info("connecting", "url", wsURL)

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("WS dial: %w", err)
	}
	defer conn.Close()

	authPayload, _ := json.Marshal(map[string]string{"daemon_id": cfg.ID, "token": cfg.Token})
	if err := writeFrame(conn, wsFrame{Type: "auth", Payload: authPayload}); err != nil {
		return fmt.Errorf("send auth: %w", err)
	}

	ack, err := readFrame(conn)
	if err != nil {
		return fmt.Errorf("read auth_ack: %w", err)
	}
	if ack.Type == "error" {
		var ep struct {
			Message string `json:"message"`
		}
		json.Unmarshal(ack.Payload, &ep)
		return fmt.Errorf("auth failed: %s", ep.Message)
	}
	slog.Info("daemon online")

	scanResult := ScanCapabilities(cfg)
	slog.Info("capabilities", "available", countAvailable(scanResult))
	if err := scanResult.Upload(ctx, cfg, cfg.ID); err != nil {
		slog.Warn("upload capabilities failed", "error", err)
	}

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("daemon shutting down")
			return nil
		case <-ticker.C:
			hbPayload, _ := json.Marshal(map[string]interface{}{
				"status":          "online",
				"daemon_version":  cfg.DaemonVersion,
				"active_tasks":    []string{},
				"runtime_summary": runtimeSummary(scanResult),
			})
			if err := writeFrame(conn, wsFrame{Type: "heartbeat", Payload: hbPayload}); err != nil {
				slog.Warn("heartbeat error", "error", err)
			}
		}
	}
}

func writeFrame(conn *websocket.Conn, frame wsFrame) error {
	data, _ := json.Marshal(frame)
	return conn.WriteMessage(websocket.TextMessage, data)
}

func readFrame(conn *websocket.Conn) (wsFrame, error) {
	_, msg, err := conn.ReadMessage()
	if err != nil {
		return wsFrame{}, err
	}
	var f wsFrame
	if err := json.Unmarshal(msg, &f); err != nil {
		return wsFrame{}, err
	}
	return f, nil
}

func wsURL(apiURL string) string {
	u := strings.Replace(apiURL, "http://", "ws://", 1)
	u = strings.Replace(u, "https://", "wss://", 1)
	return u + "/ws/daemon"
}

func countAvailable(result *ScanResult) int {
	return len(result.Runtimes)
}

func runtimeSummary(result *ScanResult) map[string]string {
	m := make(map[string]string)
	for _, rt := range result.Runtimes {
		m[rt.Kind] = rt.Version
	}
	return m
}
