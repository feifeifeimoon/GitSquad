package logging

import (
	"context"
	"testing"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

func TestTraceAttrsWithoutSpan(t *testing.T) {
	if attrs := TraceAttrs(context.Background()); attrs != nil {
		t.Fatalf("TraceAttrs = %v, want nil", attrs)
	}
}

func TestTraceAttrsWithSpan(t *testing.T) {
	tp := sdktrace.NewTracerProvider(sdktrace.WithSampler(sdktrace.AlwaysSample()))
	t.Cleanup(func() { _ = tp.Shutdown(context.Background()) })

	ctx, span := tp.Tracer("test").Start(context.Background(), "request")
	defer span.End()

	attrs := TraceAttrs(ctx)
	if len(attrs) != 4 {
		t.Fatalf("TraceAttrs returned %d attrs, want 4", len(attrs))
	}

	sc := trace.SpanContextFromContext(ctx)
	if attrs[1] != sc.TraceID().String() {
		t.Fatalf("trace_id = %v, want %s", attrs[1], sc.TraceID())
	}
	if attrs[3] != sc.SpanID().String() {
		t.Fatalf("span_id = %v, want %s", attrs[3], sc.SpanID())
	}
}
