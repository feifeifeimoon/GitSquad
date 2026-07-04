package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

// RequestLogger logs HTTP metadata (method, path, status, latency) without touching the body.
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		attrs := []any{
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", status,
			"latency_ms", latency.Milliseconds(),
		}

		if status >= 500 {
			slog.Error("http", attrs...)
		} else if status >= 400 {
			slog.Warn("http", attrs...)
		} else {
			slog.Info("http", attrs...)
		}
	}
}
