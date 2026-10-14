package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/gin-gonic/gin"
)

// The app-install callback is the one door into the console that opens from
// outside it: the browser arrives from github.com, so a wrong landing target is
// not a broken link the reader can click past, it is where the install ends.
// That is how this went unnoticed — the target had been a route the frontend
// later removed, and every install finished on a page for a workspace named
// "console".
//
// These cases stop before the installation is created, so they need no service.
// The two branches that call one — a created installation, and a failure while
// creating it — are exercised from the browser instead, by the spec that drives
// this callback and reads the page it lands on.
func TestGitHubCallbackLandsOnTheWorkspaceCreator(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const frontend = "http://localhost:3000"
	cases := []struct {
		name  string
		query string
		want  string
	}{
		{
			name:  "no installation came back",
			query: "?state=issued",
			want:  frontend + "/workspaces/new?error=install_missing",
		},
		{
			name:  "installation id is not a number",
			query: "?installation_id=not-a-number&state=issued",
			want:  frontend + "/workspaces/new?error=invalid_installation",
		},
		{
			name:  "state was never issued",
			query: "?installation_id=42&state=never-issued",
			want:  frontend + "/workspaces/new?error=invalid_state",
		},
		{
			// A missing state is the same fact as an unknown one, and GitHub
			// omitting it must not become the one silent exit.
			name:  "state is absent",
			query: "?installation_id=42",
			want:  frontend + "/workspaces/new?error=invalid_state",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := NewGitHubHandler(config.Config{FrontendURL: frontend}, nil)

			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(
				http.MethodGet, "/api/v1/github/callback"+tc.query, nil)

			h.Callback(c)

			if rec.Code != http.StatusFound {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusFound)
			}
			if got := rec.Header().Get("Location"); got != tc.want {
				t.Errorf("Location = %q, want %q", got, tc.want)
			}
		})
	}
}
