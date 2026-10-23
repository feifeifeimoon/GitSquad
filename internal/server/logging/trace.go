package logging

import (
	"context"

	"go.opentelemetry.io/otel/trace"
)

// TraceAttrs returns the trace and span ids to attach to a log line, or nil
// when ctx carries no valid span. Carrying them on the structured log is what
// lets a log search jump straight into the trace that produced the line.
func TraceAttrs(ctx context.Context) []any {
	sc := trace.SpanContextFromContext(ctx)
	if !sc.IsValid() {
		return nil
	}
	return []any{
		"trace_id", sc.TraceID().String(),
		"span_id", sc.SpanID().String(),
	}
}
