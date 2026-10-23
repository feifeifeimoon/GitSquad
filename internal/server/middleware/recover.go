package middleware

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// RecordPanic marks the active span as failed before gin.Recovery turns a panic
// into a 500. It has to sit inside the tracing middleware: otelgin ends its
// span while the panic unwinds, so anything recorded after Recovery sees an
// already-ended span.
func RecordPanic() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				span := trace.SpanFromContext(c.Request.Context())
				span.RecordError(fmt.Errorf("panic: %v", r), trace.WithStackTrace(true))
				span.SetStatus(codes.Error, "panic")
				panic(r)
			}
		}()
		c.Next()
	}
}
