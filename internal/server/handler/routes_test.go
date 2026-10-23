package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestTraceableSkipsLongLivedRoutes(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{path: "/healthz", want: false},
		{path: "/ws/daemon", want: false},
		{path: "/ws/app", want: false},
		{path: "/api/v1/issues", want: true},
		{path: "/api/v1/github/webhook", want: true},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodGet, tt.path, nil)
			if got := traceable(c); got != tt.want {
				t.Fatalf("traceable(%s) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}
